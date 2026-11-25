import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';
import {
  listStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  updateStudentStatus,
  resetStudentPassword,
  enrollStudentInCourse,
  unenrollStudentFromCourse,
} from './studentController.js';

export const studentRouter = Router();

// All student directory routes require authenticated staff roles
studentRouter.use(authenticate);
studentRouter.use(requireRole('REGISTRAR', 'LIBRARIAN', 'HOD', 'LEVEL_COORDINATOR'));

// List and view student profiles
studentRouter.get('/', listStudents);
studentRouter.get('/:id', getStudentById);

// Create single student (Registrar, Librarian, HOD)
studentRouter.post('/', requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), createStudent);

// Update student details (Registrar, Librarian, HOD)
studentRouter.put('/:id', requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), updateStudent);

// Delete student account (Registrar, Librarian)
studentRouter.delete('/:id', requireRole('REGISTRAR', 'LIBRARIAN'), deleteStudent);

// Update status (Active/Suspended/Pending)
studentRouter.patch('/:id/status', requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), updateStudentStatus);

// Generate temporary password & reset
studentRouter.post('/:id/reset-password', requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), resetStudentPassword);

// Course enrollment management for student
studentRouter.post('/:id/enroll', requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), enrollStudentInCourse);
studentRouter.delete('/:id/enroll/:courseId', requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), unenrollStudentFromCourse);
