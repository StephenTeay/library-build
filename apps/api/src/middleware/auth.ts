import { Request, Response, NextFunction } from 'express';
import { TokenUserPayload, verifyAccessToken } from '../modules/auth/tokens.js';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: TokenUserPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.accessToken;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;

    // Enforce forced password-change gate
    if (payload.mustChangePassword) {
      const cleanUrl = (req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
      const isAllowed =
        cleanUrl === '/api/auth/change-password' ||
        cleanUrl === '/api/auth/logout' ||
        cleanUrl === '/api/auth/me' ||
        cleanUrl === '/auth/change-password' ||
        cleanUrl === '/auth/logout' ||
        cleanUrl === '/auth/me' ||
        req.path === '/change-password' ||
        req.path === '/logout' ||
        req.path === '/me';

      if (!isAllowed) {
        res.status(403).json({
          error: 'Password Change Required',
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'You must change your default password before accessing the portal.',
        });
        return;
      }
    }

    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired access token' });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  let token = req.cookies?.accessToken;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  }

  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Ignore invalid token for optional auth
    }
  }
  next();
}

