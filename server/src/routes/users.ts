import { Router } from 'express';
import { userService } from '../services/UserService';
import { membershipService } from '../services/MembershipService';
import { publicUser } from '../steralizers/userSerializer';
import { userMembership } from '../steralizers/membershipSerializer';
import {badRequest, LIST_QUERY_SCHEMA} from "./routeHelpers";
import { requireAuth } from '../middleware/requireAuth';

export const usersRouter = Router();

usersRouter.get('/', requireAuth, async (request, response) => {
    const parsed = LIST_QUERY_SCHEMA.safeParse(request.query);

    if (!parsed.success) return badRequest(response, 'Invalid query', parsed.error);

    const { items, hasMore } = await userService.list({
        limit: parsed.data.limit,
        skip: parsed.data.skip,
    });

    response.json({ items: items.map(publicUser), hasMore });
});

/** GET /users/me/memberships — every organisation, venue and club the caller belongs to, with their role */
usersRouter.get('/me/memberships', requireAuth, async (request, response) => {
    const memberships = await membershipService.listForUser(request.userId!);

    response.json({ items: memberships.map(userMembership) });
});

/** GET /users/:id — one, or 404 */
usersRouter.get('/:id', requireAuth, async (request, response) => {
    const user = await userService.getById(String(request.params.id));

    if (!user) {
        response.status(404).json({ error: 'User not found' });

        return;
    }

    response.json(publicUser(user));
});
