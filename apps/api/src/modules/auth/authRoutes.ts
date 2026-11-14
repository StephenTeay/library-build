import { Router } from 'express';
import {
  login,
  refresh,
  logout,
  changePassword,
  requestPasswordReset,
  resetPassword,
  getMe,
} from './authController.js';
import { loginRateLimiter } from '../../middleware/rateLimiter.js';
import { authenticate } from '../../middleware/auth.js';

export const authRouter = Router();

// Public routes with login rate limiting
authRouter.post('/login', loginRateLimiter, login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.post('/request-reset', requestPasswordReset);
authRouter.post('/forgot-password', requestPasswordReset);
authRouter.post('/reset-password', resetPassword);

// Authenticated routes
authRouter.post('/change-password', authenticate, changePassword);
authRouter.get('/me', authenticate, getMe);

