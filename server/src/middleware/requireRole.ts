import type { NextFunction, Request, Response } from 'express';
import { isAtLeast, type Role, type ScopeType } from '../models/Membership';
import { membershipService } from '../services/MembershipService';

declare module 'express-serve-static-core' {
    interface Request {
        /** Set by requireRole: the caller's effective role in the scope named by the route. */
        scopeRole?: Role;
    }
}

/**
 * Use after requireAuth. Reads the scope id from `request.params[parameterName]`,
 * 404s if it doesn't exist, 403s unless the caller's effective role (direct, or
 * inherited from the parent organisation) is at least `minimumRole`.
 *
 * Roles are looked up per request rather than put in the access token, so a demotion
 * takes effect immediately.
 */
export function requireRole(scopeType: ScopeType, parameterName: string, minimumRole: Role) {
    return async (request: Request, response: Response, next: NextFunction) => {
        const scope = { scopeType, scopeId: String(request.params[parameterName]) };

        if (!(await membershipService.scopeExists(scope))) {
            response.status(404).json({ error: `${capitalise(scopeType)} not found` });

            return;
        }

        const role = await membershipService.getEffectiveRole(request.userId!, scope);

        if (!role || !isAtLeast(role, minimumRole)) {
            response.status(403).json({ error: 'Forbidden' });

            return;
        }

        request.scopeRole = role;
        next();
    };
}

function capitalise(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
