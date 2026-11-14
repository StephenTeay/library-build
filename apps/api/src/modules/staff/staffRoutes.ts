import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';
import {
  listStaff,
  createStaff,
  updateStaff,
  resetStaffPassword,
} from './staffController.js';

export const staffRouter = Router();

// All staff management routes require Super Admin (Librarian or Registrar)
staffRouter.use(authenticate);
staffRouter.use(requireRole('LIBRARIAN', 'REGISTRAR'));

staffRouter.get('/', listStaff);
staffRouter.post('/', createStaff);
staffRouter.patch('/:id', updateStaff);
staffRouter.post('/:id/reset-password', resetStaffPassword);
