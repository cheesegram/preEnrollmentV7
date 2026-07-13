import React, { useMemo, useEffect, useState, useRef } from 'react';
import NavLinkBtn from '../components/NavLinkBtn';
import logo from '../assets/iitilogo.png';
import Modal from '../components/Modal';
import StudentsTable from '../components/StudentsTable';
import api from "../lib/axios";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

//wowowie

const STUDENT_HEADERS = [
    "STUDENT NUMBER",
    "FIRST NAME",
    "LAST NAME",
    "YEAR",
    "SECTION",
    "SEMESTER",
    "STATUS",
];

const IMPORT_NOTIFICATION_STORAGE_KEY = "dashboardImportNotificationLog";
const IMPORT_NOTIFICATION_UNREAD_KEY = "dashboardImportNotificationUnreadCount";

const normalizeHeader = (value) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, " ");

const sanitizeFileName = (value) =>
    String(value ?? "")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\s+/g, " ");

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function exportStudentsAsCsv(students, filenameBase) {
    const rows = [
        STUDENT_HEADERS,
        ...students.map((student) => [
            String(student.student_number ?? ""),
            String(student.first_name ?? ""),
            String(student.last_name ?? ""),
            String(student.year ?? ""),
            String(student.section ?? ""),
            String(student.semester ?? ""),
            String(student.status ?? ""),
        ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filenameBase}.csv`);
}

function exportStudentsAsXlsx(students, filenameBase) {
    const rows = [
        STUDENT_HEADERS,
        ...students.map((student) => [
            String(student.student_number ?? ""),
            String(student.first_name ?? ""),
            String(student.last_name ?? ""),
            String(student.year ?? ""),
            String(student.section ?? ""),
            String(student.semester ?? ""),
            String(student.status ?? ""),
        ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    const arr = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(
        new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${filenameBase}.xlsx`
    );
}

async function parseStudentTemplateFile(file) {
    const lower = file.name.toLowerCase();
    let wb;

    if (lower.endsWith(".xlsx")) {
        const buffer = await file.arrayBuffer();
        wb = XLSX.read(buffer, { type: "array" });
    } else if (lower.endsWith(".csv")) {
        const text = await file.text();
        wb = XLSX.read(text, { type: "string" });
    } else {
        throw new Error("Only CSV and XLSX files are supported");
    }

    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) {
        throw new Error("The selected file is empty");
    }

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
        header: 1,
        defval: "",
        blankrows: false,
    });

    if (!rows.length) {
        throw new Error("The selected file has no data");
    }

    const headerRow = rows[0] || [];
    const headerMap = new Map();
    headerRow.forEach((header, index) => {
        headerMap.set(normalizeHeader(header), index);
    });

    const required = [
        "student number",
        "first name",
        "last name",
        "year",
        "semester",
        "status",
    ];

    const hasRequired = required.every((key) => headerMap.has(key));
    if (!hasRequired) {
        throw new Error("Invalid student template headers");
    }

    const getCell = (row, key) => row[headerMap.get(key)] ?? "";

    const parsed = rows
        .slice(1)
        .map((row) => ({
            student_number: String(getCell(row, "student number")).trim(),
            first_name: String(getCell(row, "first name")).trim(),
            last_name: String(getCell(row, "last name")).trim(),
            year: String(getCell(row, "year")).trim(),
            semester: String(getCell(row, "semester")).trim(),
            status: String(getCell(row, "status")).trim() || "Enrolled",
        }))
        .filter((row) => row.student_number);

    if (!parsed.length) {
        throw new Error("No student rows found in file");
    }

    return parsed;
}

function Dashboard() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState("");
    const [students, setStudents] = useState([]);
    const [sections, setSections] = useState([]);
    const [pendingApplicants, setPendingApplicants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalQuery, setModalQuery] = useState("");
    const [isRateLimited, setIsRateLimited] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [exportTypeOpen, setExportTypeOpen] = useState(false);
    const [studentExportOpen, setStudentExportOpen] = useState(false);
    const [sectionExportOpen, setSectionExportOpen] = useState(false);
    const [exportFormatOpen, setExportFormatOpen] = useState(false);
    const [exportTarget, setExportTarget] = useState(null);
    const [studentExportQuery, setStudentExportQuery] = useState("");
    const [sectionExportQuery, setSectionExportQuery] = useState("");
    const [importLogOpen, setImportLogOpen] = useState(false);
    const [importNotifications, setImportNotifications] = useState(() => {
        try {
            const raw = window.localStorage.getItem(IMPORT_NOTIFICATION_STORAGE_KEY);
            const parsed = JSON.parse(raw ?? "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [unreadImportNotifications, setUnreadImportNotifications] = useState(() => {
        try {
            const raw = window.localStorage.getItem(IMPORT_NOTIFICATION_UNREAD_KEY);
            const parsed = Number(raw ?? 0);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        } catch {
            return 0;
        }
    });
    const importInputRef = useRef(null);

    const pushImportNotification = (message, type = "info") => {
        const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            message: String(message ?? ""),
            type,
            createdAt: new Date().toISOString(),
        };

        setImportNotifications((prev) => {
            const next = [entry, ...prev].slice(0, 200);
            window.localStorage.setItem(IMPORT_NOTIFICATION_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
        setUnreadImportNotifications((prev) => {
            const nextUnread = prev + 1;
            window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, String(nextUnread));
            return nextUnread;
        });
    };

    const clearImportNotifications = () => {
        setImportNotifications([]);
        setUnreadImportNotifications(0);
        window.localStorage.removeItem(IMPORT_NOTIFICATION_STORAGE_KEY);
        window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, "0");
    };

    const openImportLog = () => {
        setImportLogOpen(true);
        setUnreadImportNotifications(0);
        window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, "0");
    };

    const isNewStudent = (student) => String(student.year) === "1" && String(student.semester) === "1st" && student.status !== "Pending";

    const newStudentsCount = students.filter(isNewStudent).length;
    const enrolledCount = students.filter(s => s.status === "Enrolled").length;
    const pendingCount = pendingApplicants.length;
    const irregularCount = students.filter(s => s.status === "Irregular").length;
    const totalCount = students.filter(s => s.status !== "Pending").length;

    useMemo(() => {
        document.title = "Dashboard - IITI Enrollment System";
    }, []);

    const recentNonPending = React.useMemo(() => {
        return students
            .filter(s => s.status !== 'Pending')
            .slice(0, 100);
    }, [students]);

    const openModal = (title) => {
        setModalTitle(title);
        setModalQuery("");
        setModalOpen(true);
    };

    const fetchStudents = async () => {
        try {
            const [studentsRes, pendingRes] = await Promise.all([
                api.get("/students", { params: { t: Date.now() } }),
                api.get("/students/pre-enrollment/to_be_admitted", { params: { t: Date.now() } }),
            ]);

            setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
            setPendingApplicants(Array.isArray(pendingRes.data) ? pendingRes.data : []);
            setIsRateLimited(false);
        } catch (error) {
            console.error("Error fetching students", error.response);
            if (error.response?.status === 429) {
                setIsRateLimited(true);
            } else {
                toast.error("Failed to load students");
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchSections = async () => {
        try {
            const sectionsRes = await api.get("/sections", { params: { t: Date.now() } });
            setSections(Array.isArray(sectionsRes.data) ? sectionsRes.data : []);
        } catch (error) {
            console.error("Error fetching sections", error);
        }
    };

    useEffect(() => {
        fetchStudents();
        fetchSections();
    }, []);

    const pendingModalApplicants = useMemo(() => {
        let result = pendingApplicants;

        if (modalQuery) {
            const q = modalQuery.trim().toLowerCase();
            result = result.filter((item) => {
                const applicantID = String(item.applicantID ?? "").toLowerCase();
                const applicantName = String(item.applicant_name ?? "").toLowerCase();
                const status = String(item.status ?? "").toLowerCase();
                return applicantID.includes(q) || applicantName.includes(q) || status.includes(q);
            });
        }

        return result;
    }, [pendingApplicants, modalQuery]);

    const modalStudents = useMemo(() => {
        let result = students;

        if (modalTitle === "New Students") {
            result = result.filter(isNewStudent);
        } else if (modalTitle === "Enrolled Students") {
            result = result.filter(s => s.status === "Enrolled");
        } else if (modalTitle === "Irregular Students") {
            result = result.filter(s => s.status === "Irregular");
        } else if (modalTitle === "All Students") {
            result = result.filter(s => s.status !== "Pending");
        }

        if (modalQuery) {
            const q = modalQuery.trim().toLowerCase();
            result = result.filter(s => {
                const first_name = String(s.first_name ?? "").trim().toLowerCase();
                const last_name = String(s.last_name ?? "").trim().toLowerCase();
                const num = String(s.student_number ?? "").toLowerCase();
                const name = `${first_name} ${last_name}`.trim().toLowerCase();
                const reverse_name = `${last_name} ${first_name}`.trim().toLowerCase();

                if (/^[a-z]/i.test(q)) return first_name.includes(q) || last_name.includes(q) || name.includes(q) || reverse_name.includes(q);
                return num.includes(q);
            });
        }
        return result;
    }, [students, pendingApplicants, modalTitle, modalQuery]);

    const exportableStudents = useMemo(() => {
        const q = studentExportQuery.trim().toLowerCase();
        const list = students.filter((s) => s.status !== "Pending");
        if (!q) return list;

        return list.filter((s) => {
            const studentNumber = String(s.student_number ?? "").toLowerCase();
            const fullName = `${String(s.first_name ?? "")} ${String(s.last_name ?? "")}`.trim().toLowerCase();
            const section = String(s.section ?? "").toLowerCase();
            const year = String(s.year ?? "").toLowerCase();
            return studentNumber.includes(q) || fullName.includes(q) || section.includes(q) || year.includes(q);
        });
    }, [students, studentExportQuery]);

    const exportableSections = useMemo(() => {
        const totalsBySectionKey = new Map();
        students
            .filter((s) => s.status !== "Pending")
            .forEach((s) => {
                const year = String(s.year ?? "").trim();
                const section = String(s.section ?? "").trim();
                const semester = String(s.semester ?? "").trim() || "N/A";
                if (!year || !section) return;
                const key = `${year}-${section}-${semester}`;
                totalsBySectionKey.set(key, Number(totalsBySectionKey.get(key) || 0) + 1);
            });

        let list = (sections || []).map((sec) => {
            const year = String(sec.year ?? "").trim();
            const section = String(sec.section ?? "").trim();
            const semester = String(sec.semester ?? "").trim() || "N/A";
            const key = `${year}-${section}-${semester}`;
            return {
                key,
                year,
                section,
                semester,
                total: Number(totalsBySectionKey.get(key) || 0),
            };
        }).sort((a, b) => {
            const yearCompare = String(a.year).localeCompare(String(b.year), undefined, { numeric: true, sensitivity: "base" });
            if (yearCompare !== 0) return yearCompare;
            const sectionCompare = String(a.section).localeCompare(String(b.section), undefined, { numeric: true, sensitivity: "base" });
            if (sectionCompare !== 0) return sectionCompare;
            return String(a.semester).localeCompare(String(b.semester), undefined, { numeric: true, sensitivity: "base" });
        });

        const q = sectionExportQuery.trim().toLowerCase();
        if (!q) return list;

        list = list.filter((section) =>
            section.year.toLowerCase().includes(q) ||
            section.section.toLowerCase().includes(q) ||
            section.semester.toLowerCase().includes(q)
        );
        return list;
    }, [students, sections, sectionExportQuery]);

    const openExportFormat = (target) => {
        setExportTarget(target);
        setExportFormatOpen(true);
    };

    const handleQuickImport = () => {
        if (isImporting) return;
        importInputRef.current?.click();
    };

    const handleEnrollApplicant = async (applicant) => {
        if (isEnrolling) return;
        try {
            setIsEnrolling(true);
            await api.post("/students/enroll-from-to-be-admitted", {
                applicantID: applicant.applicantID,
            });
            toast.success(`Enrolled ${applicant.applicant_name} successfully`);
            await fetchStudents();
            await fetchSections();
            const pendingRes = await api.get("/students/pre-enrollment/to_be_admitted", { params: { t: Date.now() } });
            setPendingApplicants(Array.isArray(pendingRes.data) ? pendingRes.data : []);
        } catch (error) {
            console.error("Enroll failed", error);
            toast.error(error?.response?.data?.message || "Failed to enroll applicant");
        } finally {
            setIsEnrolling(false);
        }
    };

    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setIsImporting(true);
            const parsedStudents = await parseStudentTemplateFile(file);
            
            // Determine import type based on filename
            const fileName = String(file.name ?? "").toLowerCase();
            const importType = fileName.includes("section") ? "section" : "student";
            
            console.log(`[Frontend] Importing ${importType} type with ${parsedStudents.length} students from ${file.name}`);
            
            const response = await api.post("/students/import", { 
                students: parsedStudents,
                importType: importType
            });

            try {
                await api.post("/sections/sync");
            } catch (syncError) {
                console.warn("[Frontend] Section sync after import failed", syncError);
            }
            
            console.log(`[Frontend] Import response:`, response.data);
            await fetchStudents();
            await fetchSections();
            
            // Show import results
            const imported = response?.data?.imported ?? 0;
            const blocked = response?.data?.blocked ?? [];
            
            console.log(`[Frontend] Import completed - imported: ${imported}, blocked: ${blocked.length}`);
            
            if (blocked.length > 0 && importType === "section") {
                // For section imports, show each blocked student
                blocked.forEach((student) => {
                    const name = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
                    const studentNumber = String(student.student_number ?? "").trim();
                    console.log(`[Frontend] Showing error for blocked student: ${name}`);
                    const msg = `${studentNumber} - ${name} : Student number already exist in the database`;
                    toast.error(msg);
                    pushImportNotification(msg, "error");
                });
                if (imported > 0) {
                    const blockedNumbers = new Set(
                        blocked.map((student) => String(student.student_number ?? "").trim())
                    );
                    const importedStudents = parsedStudents.filter(
                        (student) => !blockedNumbers.has(String(student.student_number ?? "").trim())
                    );

                    importedStudents.forEach((student) => {
                        const studentNumber = String(student.student_number ?? "").trim();
                        const name = `${String(student.first_name ?? "").trim()} ${String(student.last_name ?? "").trim()}`.trim();
                        const detailMsg = `${studentNumber} - ${name} : Imported successfully`;
                        pushImportNotification(detailMsg, "success");
                    });

                    const msg = `Imported ${imported} student records from section`;
                    toast.success(msg);
                }
            } else {
                const msg = `Imported ${imported} student records`;
                toast.success(
                    msg
                );

                parsedStudents.forEach((student) => {
                    const studentNumber = String(student.student_number ?? "").trim();
                    const name = `${String(student.first_name ?? "").trim()} ${String(student.last_name ?? "").trim()}`.trim();
                    const detailMsg = `${studentNumber} - ${name} : Imported successfully`;
                    pushImportNotification(detailMsg, "success");
                });
            }
        } catch (error) {
            console.error("[Frontend] Import failed", error);
            console.error("[Frontend] Error response:", error?.response?.data);
            
            const blockReason = error?.response?.data?.blockReason;
            const message = error?.response?.data?.message;
            const responseStatus = error?.response?.status;
            
            console.log(`[Frontend] blockReason: ${blockReason}, status: ${responseStatus}`);
            
            // Handle 409 Conflict errors (blocked imports)
            if (responseStatus === 409) {
                if (blockReason === "student_exists") {
                    // For student imports, show the blocking error
                    console.log(`[Frontend] Student import blocked - showing error`);
                    const duplicates = error?.response?.data?.duplicates ?? [];
                    if (duplicates.length > 0) {
                        duplicates.forEach((student) => {
                            const studentNumber = String(student.student_number ?? "").trim();
                            const name = `${String(student.first_name ?? "").trim()} ${String(student.last_name ?? "").trim()}`.trim();
                            const msg = `${studentNumber} - ${name} : Student number already exist in the database`;
                            toast.error(msg);
                            pushImportNotification(msg, "error");
                        });
                    } else {
                        const msg = "Import Blocked: Student Number Already Exist";
                        toast.error(msg);
                        pushImportNotification(msg, "error");
                    }
                } else if (blockReason === "all_students_exist") {
                    // For section imports where all students exist
                    const blocked = error?.response?.data?.blocked ?? [];
                    if (blocked.length > 0) {
                        blocked.forEach((student) => {
                            const name = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
                            const studentNumber = String(student.student_number ?? "").trim();
                            console.log(`[Frontend] Showing error for blocked student: ${name}`);
                            const msg = `${studentNumber} - ${name} : Student number already exist in the database`;
                            toast.error(msg);
                            pushImportNotification(msg, "error");
                        });
                    } else {
                        const msg = message || "All students in this section already exist";
                        toast.error(msg);
                        pushImportNotification(msg, "error");
                    }
                }
            } else {
                // Handle other errors
                const msg = message || error?.message || "Failed to import file";
                toast.error(msg);
                pushImportNotification(msg, "error");
            }
        } finally {
            setIsImporting(false);
            event.target.value = "";
        }
    };

    const handleExportAs = (format) => {
        if (!exportTarget) return;

        if (exportTarget.kind === "student") {
            const student = exportTarget.student;
            const name = `${String(student.first_name ?? "").trim()} ${String(student.last_name ?? "").trim()}`.trim();
            const base = sanitizeFileName(`${student.student_number}_${name}`);
            const rows = [student];
            if (format === "xlsx") {
                exportStudentsAsXlsx(rows, base || String(student.student_number));
            } else {
                exportStudentsAsCsv(rows, base || String(student.student_number));
            }
        }

        if (exportTarget.kind === "section") {
            const section = exportTarget.section;
            const rows = students.filter(
                (student) =>
                    String(student.status ?? "") !== "Pending" &&
                    String(student.year ?? "") === String(section.year) &&
                    String(student.section ?? "") === String(section.section) &&
                    (String(student.semester ?? "").trim() || "N/A") === String(section.semester)
            );

            const semesterSuffix = section.semester && section.semester !== "N/A" ? `-${section.semester}` : "";
            const base = sanitizeFileName(`${section.year}-${section.section}${semesterSuffix}`);
            if (format === "xlsx") {
                exportStudentsAsXlsx(rows, base || "section");
            } else {
                exportStudentsAsCsv(rows, base || "section");
            }
        }

        setExportFormatOpen(false);
        setExportTarget(null);
        toast.success("Export completed");
    };

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans relative">

            <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden absolute top-4 left-4 z-40 p-2 rounded-lg bg-white/90 shadow-md text-black hover:bg-white text-2xl focus:outline-none"
            >
                ☰
            </button>

            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside
                className={`
                    fixed inset-y-0 left-0 z-50
                    w-64 bg-white border-r border-gray-200
                    flex flex-col p-6
                    transform transition-transform duration-300 ease-in-out
                    ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
                    md:relative md:translate-x-0
                `}
            >
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="md:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 text-xl focus:outline-none"
                >
                    ✕
                </button>

                <div className="flex flex-col items-center mb-10 mt-4 md:mt-0">
                    <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">IITI</h1>
                    <h3 className="text-sm text-gray-500 font-medium">Enrollment System</h3>
                </div>

                <nav className="flex-1 w-full">
                    <ul className="space-y-2 w-full">
                        <NavLinkBtn />
                    </ul>
                </nav>

                <button className="mt-auto p-3 w-full flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600 font-medium">
                    Log out
                </button>
            </aside>

            <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 flex flex-col">
                <header>
                    <div className="flex flex-col sm:flex-row-reverse p-4 sm:p-6 items-center justify-center sm:justify-between w-full min-h-[6rem] sm:min-h-[8rem] bg-[url('/header.jpg')] bg-cover bg-center gap-4 relative z-20">
                        <img src={logo} className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-lg" alt="IITI Logo" />
                        <h3 className="text-sm sm:text-lg text-white font-bold text-center sm:text-right drop-shadow-md ml-auto max-w-lg">
                            INSTITUTE OF INFORMATION TECHNOLOGY AND INNOVATION
                        </h3>
                    </div>
                </header>

                {/* Subtle watermark background */}
                <div className="absolute inset-0 bg-[url('/logo.png')] bg-no-repeat bg-top bg-[length:600px] opacity-5 pointer-events-none -z-10 mt-40 mix-blend-multiply"></div>

                <section className="p-4 sm:p-6 md:p-8 flex flex-col gap-8 relative z-10 w-full max-w-[1600px] mx-auto flex-1">

                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                            <h1 className="text-2xl font-bold text-gray-800">Student Summary</h1>
                            <p className="text-sm text-gray-500">Overview of current student enrollment status.</p>
                        </div>
                        <button
                            type="button"
                            onClick={openImportLog}
                            className="relative h-10 w-10 rounded-full border border-gray-200 bg-white/90 text-gray-700 hover:text-[#2E522A] hover:border-gray-300 transition-colors"
                            aria-label="Open import notification log"
                            title="Import notification log"
                        >
                            <i className="fa-solid fa-bell text-sm"></i>
                            {unreadImportNotifications > 0 && (
                                <span className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 rounded-full bg-red-600 text-white text-[10px] leading-5 font-bold">
                                    {Math.min(unreadImportNotifications, 99)}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div
                            onClick={() => openModal("New Students")}
                            className="cursor-pointer flex flex-col justify-between rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm p-5 min-h-[10rem] hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                        >
                            <div className="w-fit rounded-full px-3 py-1 bg-gray-200">
                                <span className="text-xs sm:text-sm font-semibold text-gray-700">New Students</span>
                            </div>
                            <div className="mt-4">
                                <span className="text-3xl font-bold text-gray-800">{newStudentsCount}</span>
                                <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">Newly Registered</p>
                            </div>
                        </div>

                        <div
                            onClick={() => openModal("Enrolled Students")}
                            className="cursor-pointer flex flex-col justify-between rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm p-5 min-h-[10rem] hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                        >
                            <div className="w-fit rounded-full px-3 py-1 bg-blue-100">
                                <span className="text-xs sm:text-sm font-semibold text-blue-700">Enrolled</span>
                            </div>
                            <div className="mt-4">
                                <span className="text-3xl font-bold text-gray-800">{enrolledCount}</span>
                                <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">Enrolled Students</p>
                            </div>
                        </div>

                        <div
                            onClick={() => openModal("Irregular Students")}
                            className="cursor-pointer flex flex-col justify-between rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm p-5 min-h-[10rem] hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                        >
                            <div className="w-fit rounded-full px-3 py-1 bg-red-100">
                                <span className="text-xs sm:text-sm font-semibold text-red-700">Irregular</span>
                            </div>
                            <div className="mt-4">
                                <span className="text-3xl font-bold text-gray-800">{irregularCount}</span>
                                <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">Irregular Students</p>
                            </div>
                        </div>

                        <div
                            onClick={() => openModal("All Students")}
                            className="cursor-pointer flex flex-col justify-between rounded-2xl border border-green-800 bg-[#2E522A] p-5 min-h-[10rem] hover:shadow-lg hover:-translate-y-1 transition-all duration-200 h-full"
                        >
                            <div className="w-fit rounded-full px-3 py-1 bg-green-100/20">
                                <span className="text-xs sm:text-sm font-semibold text-green-100">Total Students</span>
                            </div>
                            <div className="mt-4">
                                <span className="text-3xl font-bold text-white">{totalCount}</span>
                                <p className="text-xs sm:text-sm text-green-100 font-medium mt-1">Overall Total</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 mt-4">
                        <h1 className="text-2xl font-bold text-gray-800">Quick Actions</h1>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <button
                            type="button"
                            onClick={() => openModal("To Be Admitted")}
                            className="flex flex-col cursor-pointer border border-gray-200 rounded-2xl bg-white/90 backdrop-blur-sm justify-center items-center py-8 px-4 gap-3 hover:shadow-md hover:border-gray-300 transition-all text-gray-600 hover:text-[#2E522A]"
                        >
                            <i className="fa-solid fa-user-plus text-2xl"></i>
                            <span className="text-sm font-medium">To Be Admitted ({pendingCount})</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleQuickImport}
                            className="flex flex-col cursor-pointer border border-gray-200 rounded-2xl bg-white/90 backdrop-blur-sm justify-center items-center py-8 px-4 gap-3 hover:shadow-md hover:border-gray-300 transition-all text-gray-600 hover:text-[#2E522A]"
                        >
                            <i className="fa-solid fa-file-import text-2xl"></i>
                            <span className="text-sm font-medium">{isImporting ? "Importing..." : "Import CSV/XLSX"}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setExportTypeOpen(true)}
                            className="flex flex-col cursor-pointer border border-gray-200 rounded-2xl bg-white/90 backdrop-blur-sm justify-center items-center py-8 px-4 gap-3 hover:shadow-md hover:border-gray-300 transition-all text-gray-600 hover:text-[#2E522A]"
                        >
                            <i className="fa-solid fa-file-export text-2xl"></i>
                            <span className="text-sm font-medium">Export CSV/XLSX</span>
                        </button>
                    </div>

                    <div className="flex flex-col gap-4 mt-4 mb-8">
                        <div className="flex items-center justify-between pb-2">
                            <h1 className="text-2xl font-bold text-gray-800">Recently Registered Students</h1>
                            <button
                                onClick={() => openModal("All Students")}
                                className="text-sm font-medium text-[#2E522A] hover:underline focus:outline-none"
                            >
                                View All
                            </button>
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            {loading ? (
                                <div className="flex items-center justify-center p-12 text-lg font-medium text-gray-500">
                                    <i className="fa-solid fa-spinner fa-spin mr-3"></i> Loading Student Records...
                                </div>
                            ) : (
                                <StudentsTable students={recentNonPending} className="fixed-header w-full" />
                            )}
                        </div>
                    </div>
                </section>
            </main>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle}>
                <div className="flex flex-col gap-4 p-4 md:p-6 max-h-[80vh] overflow-hidden">
                    <div className="relative flex w-full shrink-0">
                        <input
                            type="text"
                            inputMode="search"
                            placeholder={modalTitle === "To Be Admitted" ? "Search by Applicant Name or Number..." : "Search by Student Name or Number..."}
                            value={modalQuery}
                            onChange={e => setModalQuery(e.target.value)}
                            className="rounded-xl border border-gray-300 p-3 pl-11 pr-10 w-full focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-shadow"
                        />
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                        </div>
                        {modalQuery && (
                            <button
                                type="button"
                                onClick={() => setModalQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1"
                                aria-label="Clear search"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <div className="overflow-y-auto rounded-xl border border-gray-200 flex-1 bg-white">
                        {modalTitle === "To Be Admitted" ? (
                            <div className="rounded-xl bg-white overflow-hidden">
                                <table className="min-w-full border-collapse text-left text-sm md:text-base whitespace-nowrap">
                                    <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-gray-700">
                                        <tr>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Applicant ID</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Applicant Name</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center">Status</th>
                                            <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {pendingModalApplicants.length > 0 ? (
                                            pendingModalApplicants.map((applicant, index) => (
                                                <tr key={`${applicant.applicantID || 'applicant'}-${index}`} className="hover:bg-gray-50/80 transition-colors">
                                                    <td className="px-6 py-4 font-medium text-gray-900">{applicant.applicantID || '-'}</td>
                                                    <td className="px-6 py-4 text-gray-800">{applicant.applicant_name || '-'}</td>
                                                    <td className="px-6 py-4 text-center text-gray-700">{applicant.status || '-'}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEnrollApplicant(applicant)}
                                                            disabled={isEnrolling}
                                                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {isEnrolling ? "Enrolling..." : "Enroll"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                                                    <div className="flex flex-col items-center justify-center gap-2">
                                                        <i className="fa-regular fa-folder-open text-3xl opacity-50"></i>
                                                        <p>No applicants found.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <StudentsTable students={modalStudents} isPendingView={false} />
                        )}
                    </div>
                </div>
            </Modal>

            <Modal open={importLogOpen} onClose={() => setImportLogOpen(false)} title="Notifications">
                <div className="flex flex-col gap-3 max-h-[70vh] min-h-[18rem]">
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={clearImportNotifications}
                            disabled={!importNotifications.length}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Clear Log
                        </button>
                    </div>
                    {importNotifications.length ? (
                        <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white">
                            <ul className="divide-y divide-gray-100">
                                {importNotifications.map((item) => {
                                    const when = new Date(item.createdAt);
                                    const timeLabel = Number.isNaN(when.getTime())
                                        ? "Unknown time"
                                        : when.toLocaleString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                            hour: "numeric",
                                            minute: "2-digit",
                                        });
                                    const toneClass = item.type === "error"
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-700";

                                    return (
                                        <li key={item.id} className="p-3 sm:p-4">
                                            <div className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide w-fit ${toneClass}`}>
                                                {item.type === "error" ? "Blocked/Error" : "Success"}
                                            </div>
                                            <p className="mt-2 text-sm text-gray-800 leading-relaxed">{item.message}</p>
                                            <p className="mt-1 text-xs text-gray-500">{timeLabel}</p>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : (
                        <div className="flex-1 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center p-6 text-sm text-gray-500 text-center">
                            No import notifications yet.
                        </div>
                    )}
                </div>
            </Modal>

            <Modal open={exportTypeOpen} onClose={() => setExportTypeOpen(false)} title="Export Options">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => {
                            setExportTypeOpen(false);
                            setStudentExportOpen(true);
                        }}
                        className="px-6 py-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-semibold"
                    >
                        Export Student
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setExportTypeOpen(false);
                            setSectionExportOpen(true);
                        }}
                        className="px-6 py-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-semibold"
                    >
                        Export Section
                    </button>
                </div>
            </Modal>

            <Modal open={studentExportOpen} onClose={() => setStudentExportOpen(false)} title="Export Student">
                <div className="flex flex-col gap-4 max-h-[75vh]">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search Student Name or Number..."
                            value={studentExportQuery}
                            onChange={(e) => setStudentExportQuery(e.target.value)}
                            className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm"
                        />
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                        </div>
                    </div>
                    <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white">
                        <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3 text-left">Student Number</th>
                                    <th className="px-4 py-3 text-left">Student Name</th>
                                    <th className="px-4 py-3 text-left">Section</th>
                                    <th className="px-4 py-3 text-left">Year</th>
                                    <th className="px-4 py-3 text-center">Export</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {exportableStudents.map((student) => (
                                    <tr key={student._id || student.student_number}>
                                        <td className="px-4 py-3">{student.student_number}</td>
                                        <td className="px-4 py-3">{`${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()}</td>
                                        <td className="px-4 py-3">{student.section}</td>
                                        <td className="px-4 py-3">{student.year}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => openExportFormat({ kind: "student", student })}
                                                className="px-3 py-1.5 rounded-lg bg-[#2E522A] text-white text-xs font-semibold"
                                            >
                                                Export
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <Modal open={sectionExportOpen} onClose={() => setSectionExportOpen(false)} title="Export Section">
                <div className="flex flex-col gap-4 max-h-[75vh]">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search Year, Section, or Semester..."
                            value={sectionExportQuery}
                            onChange={(e) => setSectionExportQuery(e.target.value)}
                            className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm"
                        />
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                        </div>
                    </div>
                    <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white">
                        <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3 text-left">Year</th>
                                    <th className="px-4 py-3 text-left">Section</th>
                                    <th className="px-4 py-3 text-left">Semester</th>
                                    <th className="px-4 py-3 text-left">Students</th>
                                    <th className="px-4 py-3 text-center">Export</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {exportableSections.map((section) => (
                                    <tr key={section.key}>
                                        <td className="px-4 py-3">{section.year}</td>
                                        <td className="px-4 py-3">{section.section}</td>
                                        <td className="px-4 py-3">{section.semester}</td>
                                        <td className="px-4 py-3">{section.total}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => openExportFormat({ kind: "section", section })}
                                                className="px-3 py-1.5 rounded-lg bg-[#2E522A] text-white text-xs font-semibold"
                                            >
                                                Export
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <Modal open={exportFormatOpen} onClose={() => setExportFormatOpen(false)} title="Export as">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => handleExportAs("xlsx")}
                        className="px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                        XLSX
                    </button>
                    <button
                        type="button"
                        onClick={() => handleExportAs("csv")}
                        className="px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                        CSV
                    </button>
                </div>
            </Modal>

            <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleImportFile}
            />
        </div>
    );
}

export default Dashboard;