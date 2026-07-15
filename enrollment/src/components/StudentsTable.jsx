import React, { useState } from 'react';
import api from '../lib/axios';
import { createPortal } from 'react-dom';

function StudentsTable({ students, className = "", isPendingView = false }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedSubjectView, setSelectedSubjectView] = useState(null);
  const [selectedSubjectSubjects, setSelectedSubjectSubjects] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectError, setSubjectError] = useState('');
  const [curriculumCache, setCurriculumCache] = useState({});

  const normalizeYearKey = (year) => {
    const raw = String(year ?? '').trim().toLowerCase();
    const map = {
      '1': '1st',
      '1st': '1st',
      first: '1st',
      'first year': '1st',
      '2': '2nd',
      '2nd': '2nd',
      second: '2nd',
      'second year': '2nd',
      '3': '3rd',
      '3rd': '3rd',
      third: '3rd',
      'third year': '3rd',
      '4': '4th',
      '4th': '4th',
      fourth: '4th',
      'fourth year': '4th',
    };

    return map[raw] || null;
  };

  const getSemesterIndex = (semester) => {
    const raw = String(semester ?? '').trim().toLowerCase();

    if (['1', '1st', 'first', 'first semester', '1st semester'].includes(raw)) {
      return 0;
    }

    if (['2', '2nd', 'second', 'second semester', '2nd semester'].includes(raw)) {
      return 1;
    }

    return -1;
  };

  const handleOpenStudentSubjects = async (student, view) => {
    setSelectedStudent(student);
    setSelectedSubjectView(view);
    setSelectedSubjectSubjects([]);
    setSubjectError('');
    setSubjectLoading(true);

    try {
      const isIrregular = String(student?.status ?? '').trim().toLowerCase() === 'irregular';

      if (isIrregular) {
        const curriculumId = String(student?.student_number ?? '').trim();
        if (!curriculumId) {
          setSubjectError('Student number is required to load this view.');
          return;
        }

        const res = await api.get(`/curriculum/doc/${encodeURIComponent(curriculumId)}`);
        const curriculumDoc = res?.data;
        const subjects = Array.isArray(curriculumDoc?.subjects)
          ? curriculumDoc.subjects
          : (
              Array.isArray(curriculumDoc?.semesters)
                ? curriculumDoc.semesters.flatMap((semester) =>
                    Array.isArray(semester?.subjects) ? semester.subjects : []
                  )
                : []
            );

        if (!subjects.length) {
          setSubjectError('No subjects found for this student.');
          return;
        }

        setSelectedSubjectSubjects(subjects);
        return;
      }

      const yearKey = normalizeYearKey(student?.year);
      const semesterIndex = getSemesterIndex(student?.semester);

      if (!yearKey || semesterIndex < 0) {
        setSubjectError('This view is unavailable for this student year/semester.');
        return;
      }

      let curriculumDoc = curriculumCache[yearKey];
      if (!curriculumDoc) {
        const res = await api.get(`/curriculum/${yearKey}`);
        curriculumDoc = res.data;
        setCurriculumCache((prev) => ({ ...prev, [yearKey]: curriculumDoc }));
      }

      const semesterSubjects = curriculumDoc?.semesters?.[semesterIndex]?.subjects;
      if (!Array.isArray(semesterSubjects) || semesterSubjects.length === 0) {
        setSubjectError('No subjects found for this semester.');
        return;
      }

      setSelectedSubjectSubjects(semesterSubjects);
    } catch (error) {
      setSubjectError('Failed to load subject data.');
    } finally {
      setSubjectLoading(false);
    }
  };

  const handleOpenCurriculum = (student) => handleOpenStudentSubjects(student, 'curriculum');
  const handleOpenSchedule = (student) => handleOpenStudentSubjects(student, 'schedule');

  const getStatusStyle = (status) => {
    const normalizedStatus = status?.toLowerCase() || '';

    // Block matches the blue style
    if (normalizedStatus === 'block') {
      return 'bg-blue-100 text-blue-700 font-bold';
    }
    // Enrolled matches the blue style
    if (normalizedStatus.includes('enrolled')) {
      return 'bg-blue-100 text-blue-700 font-bold';
    }
    // Irregular/Overloaded matches the red style
    if (normalizedStatus.includes('irregular') || normalizedStatus.includes('overloaded')) {
      return 'bg-red-100 text-red-700 font-bold';
    }
    // Pending/In Progress matches the yellow style
    if (normalizedStatus.includes('pending') || normalizedStatus.includes('progress')) {
      return 'bg-yellow-100 text-yellow-700 font-bold';
    }
    // Regular/Balance can use a green style if needed, or fallback
    if (normalizedStatus.includes('regular') || normalizedStatus.includes('balance')) {
      return 'bg-green-100 text-green-700 font-bold';
    }

    return 'bg-gray-100 text-gray-700 font-bold';
  };

  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden font-sans h-full min-h-[340px] flex flex-col ${className}`}>
      <div className="h-[420px] min-h-[420px] overflow-y-auto custom-scrollbar">
        <table className="min-w-full border-collapse text-left text-sm md:text-base whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-gray-700">
            <tr>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">{isPendingView ? 'Applicant Number' : 'Student Number'}</th>
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">{isPendingView ? 'Applicant Name' : 'Student Name'}</th>
              {!isPendingView && <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Section</th>}
              {!isPendingView && <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Year</th>}
              {!isPendingView && <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Semester</th>}
              {!isPendingView && <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center">Schedule</th>}
              {!isPendingView && <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center">Curriculum</th>}
              <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center">Status</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {students && students.length > 0 ? (
              students.map((student, index) => (
                <tr key={student._id || index} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{isPendingView ? student.applicant_number : student.student_number}</td>
                  <td className="px-6 py-4 text-gray-800">{isPendingView ? student.applicant_name : `${student.first_name} ${student.last_name}`}</td>
                  {!isPendingView && <td className="px-6 py-4 text-gray-600">{student.section}</td>}
                  {!isPendingView && <td className="px-6 py-4 text-gray-600">{student.year}</td>}
                  {!isPendingView && <td className="px-6 py-4 text-gray-600">{student.semester || '-'}</td>}
                  {!isPendingView && (
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleOpenSchedule(student)}
                        className="text-gray-400 hover:text-[#2E522A] transition-colors p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50"
                        aria-label="View Schedule"
                      >
                        <i className="fa-solid fa-caret-down text-xl"></i>
                      </button>
                    </td>
                  )}
                  {!isPendingView && (
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleOpenCurriculum(student)}
                        className="text-gray-400 hover:text-[#2E522A] transition-colors p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50"
                        aria-label="View Curriculum"
                      >
                        <i className="fa-solid fa-caret-down text-xl"></i>
                      </button>
                    </td>
                  )}
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs tracking-wide ${getStatusStyle(student.status)}`}>
                      {student.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isPendingView ? 3 : 7} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-regular fa-folder-open text-3xl opacity-50"></i>
                    <p>No students found.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedStudent && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 md:p-6">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedStudent(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 my-4">
            <div className="flex items-center justify-between p-5 md:p-6 border-b border-gray-100 bg-white">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedSubjectView === 'schedule' ? 'Class Schedule' : 'Class Curriculum'}
                </h3>
                <p className="text-sm font-medium text-gray-500 mt-1">
                  {selectedStudent.first_name} {selectedStudent.last_name} <span className="mx-1">•</span> {selectedStudent.student_number} <span className="mx-1">•</span> {selectedStudent.section}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudent(null)}
                className="text-gray-400 hover:text-gray-800 bg-white hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-5 md:p-6 bg-gray-50/50 min-h-[300px]">
              {subjectLoading ? (
                <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-gray-500 gap-3">
                  <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#2E522A]"></i>
                  <p className="text-sm font-medium">Loading {selectedSubjectView === 'schedule' ? 'schedule' : 'curriculum'}...</p>
                </div>
              ) : subjectError ? (
                <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-gray-500 gap-2 text-center">
                  <i className="fa-regular fa-calendar-xmark text-4xl text-gray-400 opacity-70"></i>
                  <p className="text-base font-semibold text-gray-700">{selectedSubjectView === 'schedule' ? 'Schedule details not available.' : 'Curriculum details not available.'}</p>
                  <p className="text-sm text-gray-500">{subjectError}</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="min-w-full text-sm border-collapse">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Code</th>
                          <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Title</th>
                          <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Lec</th>
                          <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Lab</th>
                          <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Units</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedSubjectSubjects.map((subject, idx) => (
                          <tr key={`${subject.subject_code || subject.code || 'subject'}-${idx}`} className="hover:bg-gray-50/80">
                            <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">
                              {subject.subject_code || subject.code || '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-700">{subject.title || '-'}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{subject.lecture ?? 0}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{subject.laboratory ?? 0}</td>
                            <td className="px-4 py-3 text-center text-gray-800 font-semibold">{subject.units ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
              <button
                        onClick={() => {
                          setSelectedStudent(null);
                          setSelectedSubjectView(null);
                          setSelectedSubjectSubjects([]);
                          setSubjectError('');
                        }}
                className="px-6 py-2 bg-gray-100 text-gray-700 hover:text-gray-900 rounded-xl font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default StudentsTable;