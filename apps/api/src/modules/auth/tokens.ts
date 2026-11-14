import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Response } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production-with-min-64-random-chars-123456789';
const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface TokenUserPayload {
  userId: string;
  email: string;
  matricNo: string | null;
  role: 'LIBRARIAN' | 'REGISTRAR' | 'LIBRARY_STAFF' | 'HOD' | 'LEVEL_COORDINATOR' | 'LECTURER' | 'STUDENT';
  departmentId: number | null;
  programme: 'ND' | 'HND' | null;
  level: number | null;
  mustChangePassword: boolean;
}

export function generateAccessToken(user: TokenUserPayload): string {
  return jwt.sign(
    {
      sub: user.userId,
      email: user.email,
      matricNo: user.matricNo,
      role: user.role,
      departmentId: user.departmentId,
      programme: user.programme,
      level: user.level,
      mustChangePassword: user.mustChangePassword,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function verifyAccessToken(token: string): TokenUserPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as any;
  return {
    userId: decoded.sub,
    email: decoded.email,
    matricNo: decoded.matricNo,
    role: decoded.role,
    departmentId: decoded.departmentId,
    programme: decoded.programme,
    level: decoded.level,
    mustChangePassword: decoded.mustChangePassword,
  };
}

export function generateOpaqueToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

export function clearAuthCookies(res: Response) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('accessToken', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
  res.clearCookie('refreshToken', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
}

