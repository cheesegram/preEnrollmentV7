import express from "express";
import {
  createStudent,
  deleteStudent,
  getAllStudents,
  getPendingApplicants,
  getToBeAdmittedApplicants,
  getStudentById,
  getStudentSections,
  getStudentBySection,
  importStudents,
  updateStudent,
} from "../controllers/studentsController.js";

const router = express.Router();

router.get("/", getAllStudents);
router.get("/pending", getPendingApplicants);
router.get("/pre-enrollment/to_be_admitted", getToBeAdmittedApplicants);
router.get("/sections", getStudentSections);
router.get("/section/:section", getStudentBySection);
router.post("/import", importStudents);
router.get("/:id", getStudentById);
router.post("/", createStudent);
router.put("/:id", updateStudent);
router.delete("/:id", deleteStudent);

export default router;
