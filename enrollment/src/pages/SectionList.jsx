import React, { useEffect, useState, useMemo } from 'react';
import NavLinkBtn from '../components/NavLinkBtn';
import logo from '../assets/iitilogo.png';
import SectionTable from '../components/SectionTable';
import api from "../lib/axios";

function SectionList() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [selected, setSelected] = useState("All");
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");

    const displayedSections = useMemo(() => {
        let result = sections;
        if (query) {
            const q = query.trim().toLowerCase();
            const combinedMatch = q.match(/^(\d+)\s*([a-z]+)$/i);
            const reverseCombinedMatch = q.match(/^([a-z]+)\s*(\d+)$/i);

            if (combinedMatch) {
                const [, yearPart, sectionPart] = combinedMatch;
                result = result.filter(r =>
                    String(r.year) === yearPart && r.section.toLowerCase() === sectionPart.toLowerCase()
                );
            } else if (reverseCombinedMatch) {
                const [, sectionPart, yearPart] = reverseCombinedMatch;
                result = result.filter(r =>
                    String(r.year) === yearPart && r.section.toLowerCase() === sectionPart.toLowerCase()
                );
            } else {
                result = result.filter(r =>
                    String(r.year).includes(q) ||
                    r.section.toLowerCase().includes(q)
                );
            }
        }

        if (selected !== "All") {
            result = result.filter(r => {
                if (selected === "Available") return r.status === "Available";
                if (selected === "Full") return r.status === "Full";
                if (selected === "Overloaded") return r.status === "Overloaded";
                return true;
            });
        }

        result = [...result].sort((a, b) => {
            const yearCompare = Number(a.year) - Number(b.year);
            if (yearCompare !== 0) return yearCompare;

            const semesterOrder = { "1st": 1, "2nd": 2 };
            const aSemester = semesterOrder[String(a.semester ?? '').trim()] ?? 99;
            const bSemester = semesterOrder[String(b.semester ?? '').trim()] ?? 99;
            if (aSemester !== bSemester) return aSemester - bSemester;

            return String(a.section ?? '').localeCompare(String(b.section ?? ''), undefined, {
                numeric: true,
                sensitivity: 'base',
            });
        });

        return result;
    }, [sections, query, selected]);

    const refreshSections = async ({ withLoading = false } = {}) => {
        try {
            if (withLoading) setLoading(true);
            await api.post("/sections/sync");
            const sectionsRes = await api.get("/sections", { params: { t: Date.now() } });
            const rawSections = Array.isArray(sectionsRes.data) ? sectionsRes.data : [];
            const normalized = rawSections.map((s) => ({
                ...s,
                total: Number(s.regular || 0) + Number(s.irregular || 0),
            }));
            setSections(normalized);
        } catch (e) {
            console.error("Failed to load sections", e);
        } finally {
            if (withLoading) setLoading(false);
        }
    };

    useEffect(() => {
        refreshSections({ withLoading: true });
    }, []);

    return (
        <div className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans relative">
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

                {/* Subtle watermark background matching the other pages */}
                <div className="absolute inset-0 bg-[url('/logo.png')] bg-no-repeat bg-top bg-[length:600px] opacity-5 pointer-events-none -z-10 mt-40 mix-blend-multiply"></div>

                <section className="p-4 sm:p-6 md:p-8 flex flex-col gap-6 relative z-10 flex-1 w-full max-w-[1600px] mx-auto">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Section List</h1>
                    </div>

                    <div className="flex flex-col p-5 md:p-6 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-sm gap-6 w-full">

                        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between w-full">
                            <div className="relative flex-1 w-full lg:max-w-xl shrink-0">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                                </div>
                                <input
                                    type="search"
                                    placeholder="Search by Year and Section..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2E522A] focus:border-transparent transition-all sm:text-sm shadow-sm"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest hidden md:block mr-2">
                                    Filter Status
                                </span>
                                {["All", "Available", "Full", "Overloaded"].map((item) => (
                                    <label
                                        key={item}
                                        className={`flex items-center justify-center px-4 py-2 text-sm rounded-lg cursor-pointer transition-all ${selected === item
                                            ? "bg-[#2E522A] text-white shadow-md font-medium"
                                            : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="status"
                                            value={item}
                                            checked={selected === item}
                                            onChange={() => setSelected(item)}
                                            className="sr-only"
                                        />
                                        {item}
                                    </label>
                                ))}
                                <div className="hidden lg:block h-7 w-px bg-gray-200 mx-1" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex-1 mb-8 flex flex-col min-h-[400px] w-full relative z-0">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center flex-1 p-12 text-gray-500 gap-4">
                                <i className="fa-solid fa-circle-notch fa-spin text-4xl text-[#2E522A]"></i>
                                <span className="text-lg font-medium">Loading Section Data...</span>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto">
                                <SectionTable
                                    sections={displayedSections}
                                />
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}

export default SectionList;