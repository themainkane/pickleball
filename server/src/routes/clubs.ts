import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { isAtLeast, Role, ScopeType } from '../models/Membership';
import { clubService } from '../services/ClubService';
import { membershipService } from '../services/MembershipService';
import { venueService } from '../services/VenueService';
import { publicClub } from '../serializers/clubSerializer';
import { createMembersRouter } from './members';
import { badRequest, OBJECT_ID_SCHEMA } from './routeHelpers';

export const clubsRouter = Router();

const CREATE_CLUB_BODY = z.object({
    name: z.string().trim().min(1).max(120),
    organisationId: OBJECT_ID_SCHEMA.optional(),
    homeVenueId: OBJECT_ID_SCHEMA.optional(),
});

const UPDATE_CLUB_BODY = CREATE_CLUB_BODY.omit({ organisationId: true }).partial();

/**
 * POST /clubs — create; the caller becomes owner.
 * Anyone can start an independent club. Attaching it to an organisation needs
 * organisation admin+, otherwise anyone could put clubs under someone else's business.
 */
clubsRouter.post('/', requireAuth, async (request, response) => {
    const parsed = CREATE_CLUB_BODY.safeParse(request.body);

    if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

    const { organisationId, homeVenueId } = parsed.data;

    if (organisationId) {
        const role = await membershipService.getEffectiveRole(request.userId!, {
            scopeType: ScopeType.Organisation,
            scopeId: organisationId,
        });

        if (!isAtLeast(role, Role.Admin)) {
            response.status(403).json({ error: 'Organisation admin required' });

            return;
        }
    }

    if (homeVenueId && !(await venueService.getById(homeVenueId))) {
        response.status(400).json({ error: 'Home venue not found' });

        return;
    }

    const club = await clubService.createWithOwner(parsed.data, request.userId!);

    response.status(201).json(publicClub(club));
});

/** GET /clubs/:clubId */
clubsRouter.get('/:clubId', requireAuth, async (request, response) => {
    const club = await clubService.getById(String(request.params.clubId));

    if (!club) {
        response.status(404).json({ error: 'Club not found' });

        return;
    }

    response.json(publicClub(club));
});

/** PATCH /clubs/:clubId — club admin+, or admin+ of the organisation that runs it */
clubsRouter.patch('/:clubId', requireAuth, requireRole(ScopeType.Club, 'clubId', Role.Admin), async (request, response) => {
    const parsed = UPDATE_CLUB_BODY.safeParse(request.body);

    if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

    if (parsed.data.homeVenueId && !(await venueService.getById(parsed.data.homeVenueId))) {
        response.status(400).json({ error: 'Home venue not found' });

        return;
    }

    const club = await clubService.updateDetails(String(request.params.clubId), parsed.data);

    if (!club) {
        response.status(404).json({ error: 'Club not found' });

        return;
    }

    response.json(publicClub(club));
});

clubsRouter.use('/:clubId/members', createMembersRouter(ScopeType.Club, 'clubId'));
