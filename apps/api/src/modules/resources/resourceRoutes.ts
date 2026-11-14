import { Router } from 'express';
import {
  presignUpload,
  confirmUpload,
  createExternalResource,
  downloadResource,
  getCourseResources,
  deleteResource,
} from './resourceController.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleScope.js';

export const resourceRouter = Router();

// Presigned upload URL generation (Lecturer assigned, HOD, Registrar)
resourceRouter.post(
  '/presign-upload',
  authenticate,
  requireRole('REGISTRAR', 'HOD', 'LECTURER'),
  presignUpload
);

// Mandatory confirm step (verifies object exists via HEAD before inserting DB row)
resourceRouter.post(
  '/confirm',
  authenticate,
  requireRole('REGISTRAR', 'HOD', 'LECTURER'),
  confirmUpload
);

// Publish external resource (YouTube, Colab, GitHub, NBS portal)
resourceRouter.post(
  '/external',
  authenticate,
  requireRole('REGISTRAR', 'HOD', 'LECTURER'),
  createExternalResource
);

// Download resource (Enforces course enrollment / staff assignment, returns short-lived presigned GET)
resourceRouter.get('/:id/download', authenticate, downloadResource);

// List resources for course
resourceRouter.get('/course/:course_id', authenticate, getCourseResources);

// Delete resource
resourceRouter.delete(
  '/:id',
  authenticate,
  requireRole('REGISTRAR', 'HOD', 'LECTURER'),
  deleteResource
);

