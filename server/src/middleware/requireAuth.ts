import type { NextFunction, Request, Response } from 'express';
import { authService } from '../services/AuthService';

declare module 'express-serve-static-core' {
    interface Request {
        /** Set by requireAuth. */
        userId?: string;
    }
}

/** Validates `Authorization: Bearer <access token>` and sets request.userId. */
export function requireAuth(request: Request, response: Response, next: NextFunction) {
    const header = request.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        response.status(401).json({ error: 'Not authenticated' });

        return;
    }

    try {
        request.userId = authService.verifyAccessToken(token).sub;
        next();
    } catch {
        // Expired, bad signature, malformed — client should try /auth/refresh.
        response.status(401).json({ error: 'Not authenticated' });
    }
}
