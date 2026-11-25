import { Router } from 'express';
import {
  getAllCourses,
  getEnrolledCourses,
  getCourseById,
  enrollInCourse,
  getCourseReserves,
  addCourseReserve,
  removeCourseReserve,
  createCourse,
  updateCourse,
  deleteCourse,
} from './courseController.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';

export const courseRouter = Router();

// 1. Get enrolled courses for student / assigned for lecturer
courseRouter.get('/enrolled', authenticate, getEnrolledCourses);

// 2. Get all courses (scoped to role/dept)
courseRouter.get('/', authenticate, getAllCourses);

// 3. Create course (Registrar, Librarian, HOD)
courseRouter.post('/', authenticate, requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), createCourse);

// 4. Get single course by ID
courseRouter.get('/:id', authenticate, getCourseById);

// 5. Update course (Registrar, Librarian, HOD)
courseRouter.put('/:id', authenticate, requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), updateCourse);

// 6. Delete course (Registrar, Librarian, HOD)
courseRouter.delete('/:id', authenticate, requireRole('REGISTRAR', 'LIBRARIAN', 'HOD'), deleteCourse);

// 7. Enroll in a course
courseRouter.post('/:id/enroll', authenticate, enrollInCourse);

// 8. Course Reserves (Physical/Digital Syllabus Reading Lists)
courseRouter.get('/:id/reserves', authenticate, getCourseReserves);
courseRouter.post('/:id/reserves', authenticate, addCourseReserve);
courseRouter.delete('/:id/reserves/:reserveId', authenticate, removeCourseReserve);

