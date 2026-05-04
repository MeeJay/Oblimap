import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    userId: number;
    username: string;
    role: string;
    currentTenantId: number;
    oauthState: string;
    /** Cross-app tenant handoff — slug captured by /auth/sso-redirect, applied
     *  in /auth/callback once the user comes back from Obligate, then cleared.
     *  Spec: D:\Mockup\obli-cross-app-tenant-handoff.md */
    requestedTenantSlug?: string;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    next(new AppError(401, 'Authentication required'));
    return;
  }
  next();
}
