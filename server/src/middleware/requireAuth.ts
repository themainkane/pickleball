import type { NextFunction, Request, Response } from 'express';
import { authService } from '../services/AuthService';

declare module 'express-serve-static-core' {
    interface Request {
        /** Set by requireAuth. */
        userId?: string;
    }
}

/** Validates `Authorization: Bearer <access token>` and sets req.userId. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        res.status(401).json({ error: 'Not authenticated' });

        return;
    }

    try {
        req.userId = authService.verifyAccessToken(token).sub;
        next();
    } catch {
        // Expired, bad signature, malformed — client should try /auth/refresh.
        res.status(401).json({ error: 'Not authenticated' });
    }
}
