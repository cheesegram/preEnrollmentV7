import React, { useMemo, useState } from "react";
import NavLinkBtn from "../components/NavLinkBtn";
import logo from "../assets/iitilogo.png";
import CurriculumTable from "../components/CurriculumTable";
//test two
function Curriculum() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [lastRegularImportAt, setLastRegularImportAt] = useState(() => {
        const stored = window.localStorage.getItem("curriculumLastRegularImportAt");
        return stored || null;
    });

    const updatedLabel = useMemo(() => {
        if (!lastRegularImportAt) {
            return "UPDATED LIST AS OF 2025";
        }

        const parsed = new Date(lastRegularImportAt);
        if (Number.isNaN(parsed.getTime())) {
            return "UPDATED LIST AS OF 2025";
        }

        const formatted = parsed.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
        }).toUpperCase();

        return `UPDATED LIST AS OF ${formatted}`;
    }, [lastRegularImportAt]);

    const handleRegularImportSuccess = (dateValue) => {
        const isoDate = (dateValue instanceof Date ? dateValue : new Date()).toISOString();
        setLastRegularImportAt(isoDate);
        window.localStorage.setItem("curriculumLastRegularImportAt", isoDate);
    };

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

                {/* Subtle watermark background */}
                <div className="absolute inset-0 md:bg-[url('/logo.png')] bg-no-repeat bg-center bg-contain opacity-5 pointer-events-none -z-10 mt-32"></div>

                <section className="p-4 sm:p-6 md:p-8 flex flex-col gap-6 relative z-10 flex-1 w-full max-w-[1600px] mx-auto">

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Curriculum</h1>
                        <div className="flex flex-col sm:items-end text-gray-600">
                            <span className="text-sm font-medium uppercase tracking-wider">{updatedLabel}</span>
                        </div>
                    </div>

                    <div className="flex bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200 p-2 sm:p-6 w-full flex-1 min-h-[500px]">
                        <CurriculumTable onRegularImportSuccess={handleRegularImportSuccess} />
                    </div>

                </section>
            </main>
        </div>
    );
}

export default Curriculum;  