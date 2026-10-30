import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { Role, ScopeType } from '../models/Membership';
import { membershipService, type MembershipChangeResult, type Scope } from '../services/MembershipService';
import { userService } from '../services/UserService';
import { publicMember } from '../steralizers/membershipSerializer';
import { badRequest, listQuerySchema, objectIdSchema } from './routeHelpers';

const ADD_MEMBER_BODY = z.object({
    userId: objectIdSchema,
    role: z.enum(Role),
});

const CHANGE_ROLE_BODY = z.object({
    role: z.enum(Role),
});

const FAILURE_RESPONSES: Record<Exclude<MembershipChangeResult, { ok: true }>['reason'], [number, string]> = {
    not_found: [404, 'Member not found'],
    forbidden: [403, 'Forbidden'],
    last_owner: [409, 'Cannot remove or demote the last owner'],
    already_member: [409, 'User is already a member'],
};

function sendResult(response: Response, result: MembershipChangeResult, successStatus: number) {
    if (result.ok) {
        response.status(successStatus).end();

        return;
    }

    const [status, error] = FAILURE_RESPONSES[result.reason];
    response.status(status).json({ error });
}

/**
 * Member management, identical for organisations, venues and clubs. Mounted under the
 * parent route, e.g. `/clubs/:clubId/members`, so `parameterName` must match that route.
 *
 *  GET    /            any member   list members
 *  POST   /            admin+       add someone (can only grant roles below your own, unless owner)
 *  PATCH  /:userId     admin+       change someone's role (must outrank them, unless owner)
 *  DELETE /:userId     member+      remove someone you outrank, or yourself (leave)
 *
 * An organisation's admins/owners count as admins/owners of its venues and clubs.
 * Nobody can remove or demote the last owner.
 */
export function createMembersRouter(scopeType: ScopeType, parameterName: string) {
    const router = Router({ mergeParams: true });

    const scopeFrom = (request: Request): Scope => ({ scopeType, scopeId: String(request.params[parameterName]) });
    const actorFrom = (request: Request) => ({ userId: request.userId!, role: request.scopeRole! });

    router.get('/', requireAuth, requireRole(scopeType, parameterName, Role.Member), async (request, response) => {
        const parsed = listQuerySchema.safeParse(request.query);

        if (!parsed.success) return badRequest(response, 'Invalid query', parsed.error);

        const { items, hasMore } = await membershipService.listMembers(scopeFrom(request), parsed.data);

        response.json({ items: items.map(publicMember), hasMore });
    });

    router.post('/', requireAuth, requireRole(scopeType, parameterName, Role.Admin), async (request, response) => {
        const parsed = ADD_MEMBER_BODY.safeParse(request.body);

        if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

        if (!(await userService.getById(parsed.data.userId))) {
            response.status(404).json({ error: 'User not found' });

            return;
        }

        const result = await membershipService.addMember(
            actorFrom(request),
            scopeFrom(request),
            parsed.data.userId,
            parsed.data.role,
        );

        sendResult(response, result, 201);
    });

    router.patch('/:userId', requireAuth, requireRole(scopeType, parameterName, Role.Admin), async (request, response) => {
        const parsed = CHANGE_ROLE_BODY.safeParse(request.body);

        if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

        const result = await membershipService.changeRole(
            actorFrom(request),
            scopeFrom(request),
            String(request.params.userId),
            parsed.data.role,
        );

        sendResult(response, result, 204);
    });

    router.delete('/:userId', requireAuth, requireRole(scopeType, parameterName, Role.Member), async (request, response) => {
        const result = await membershipService.removeMember(
            actorFrom(request),
            scopeFrom(request),
            String(request.params.userId),
        );

        sendResult(response, result, 204);
    });

    return router;
}
