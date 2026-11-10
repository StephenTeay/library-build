import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// Bounded in-memory store for rate limiting (prevents unbounded memory growth)
const ipStore = new Map<string, RateLimitRecord>();
const MAX_ENTRIES = 5000;

function cleanupStore() {
  const now = Date.now();
  for (const [key, record] of ipStore.entries()) {
    if (record.resetAt <= now) {
      ipStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupStore, 5 * 60 * 1000).unref();

export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // If in test mode and rate limiting is disabled, skip
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Prevent map from exploding
    if (ipStore.size >= MAX_ENTRIES) {
      cleanupStore();
    }

    let record = ipStore.get(ip);
    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + options.windowMs };
      ipStore.set(ip, record);
    } else {
      record.count++;
    }

    if (record.count > options.max) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      res.status(429).json({
        error: 'Too Many Requests',
        message: options.message || 'Too many requests from this IP. Please try again later.',
        retryAfter: retryAfterSec,
      });
      return;
    }

    next();
  };
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // 5 requests per window
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
});

export function clearRateLimitStore() {
  ipStore.clear();
}

