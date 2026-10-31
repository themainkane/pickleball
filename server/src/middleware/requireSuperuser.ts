import type { NextFunction, Request, Response } from 'express';
import { userService } from '../services/UserService';

/**
 * Use after requireAuth. Looked up per request rather than put in the access token,
 * so revoking superuser takes effect immediately.
 */
export async function requireSuperuser(request: Request, response: Response, next: NextFunction) {
    const user = await userService.getById(request.userId!);

    if (!user?.isSuperuser) {
        response.status(403).json({ error: 'Forbidden' });

        return;
    }

    next();
}
