import { Router } from 'express';
import {
  getAllCourses,
  getEnrolledCourses,
  getCourseById,
  enrollInCourse,
} from './courseController.js';
import { authenticate } from '../../middleware/auth.js';

export const courseRouter = Router();

// 1. Get enrolled courses for student / assigned for lecturer
courseRouter.get('/enrolled', authenticate, getEnrolledCourses);

// 2. Get all courses (scoped to role/dept)
courseRouter.get('/', authenticate, getAllCourses);

// 3. Get single course by ID
courseRouter.get('/:id', authenticate, getCourseById);

// 4. Enroll in a course
courseRouter.post('/:id/enroll', authenticate, enrollInCourse);
