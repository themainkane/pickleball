import { Router } from 'express';
import { z } from 'zod';
import { userService } from '../services/UserService';
import { membershipService } from '../services/MembershipService';
import { publicUser } from '../steralizers/userSerializer';
import { userMembership } from '../steralizers/membershipSerializer';
import {isDuplicateKey} from "./routeHelpers";
import { requireAuth } from '../middleware/requireAuth';

export const usersRouter = Router();

const createUserBody = z.object({
    email: z.email(),
    password: z.string().min(12).max(200),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    rating: z.coerce.number().min(0).max(8).optional(),
});

const listQuery = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
});

/** POST /users — create */
usersRouter.post('/', async (req, res) => {
    const parsed = createUserBody.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({
            error: 'Invalid body',
            details: parsed.error.flatten().fieldErrors,
        });

        return;
    }

    try {
        const user = await userService.register(parsed.data);
        res.status(201).json(publicUser(user));
    } catch (err) {
        if (isDuplicateKey(err)) {
            res.status(409).json({ error: 'That email is already registered' });

            return;
        }

        throw err;
    }
});

usersRouter.get('/', requireAuth, async (req, res) => {
    const parsed = listQuery.safeParse(req.query);

    if (!parsed.success) {
        res.status(400).json({
            error: 'Invalid query',
            details: parsed.error.flatten().fieldErrors,
        });

        return;
    }

    const { items, hasMore } = await userService.list({
        limit: parsed.data.limit,
        skip: parsed.data.skip,
    });

    res.json({ items: items.map(publicUser), hasMore });
});

/** GET /users/me/memberships — every organisation, venue and club the caller belongs to, with their role */
usersRouter.get('/me/memberships', requireAuth, async (request, response) => {
    const memberships = await membershipService.listForUser(request.userId!);

    response.json({ items: memberships.map(userMembership) });
});

/** GET /users/:id — one, or 404 */
usersRouter.get('/:id', requireAuth, async (req, res) => {
    const user = await userService.getById(String(req.params.id));

    if (!user) {
        res.status(404).json({ error: 'User not found' });

        return;
    }

    res.json(publicUser(user));
});
