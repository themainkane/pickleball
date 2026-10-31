import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { SURFACES } from '../models/Court';
import { Role, ScopeType } from '../models/Membership';
import { courtService } from '../services/CourtService';
import { venueService } from '../services/VenueService';
import { publicCourt } from '../serializers/courtSerializer';
import { badRequest, isDuplicateKey } from './routeHelpers';

/** Mounted at /venues/:venueId/courts. */
export const courtsRouter = Router({ mergeParams: true });

const CREATE_COURT_BODY = z.object({
    name: z.string().trim().min(1).max(60),
    surface: z.enum(SURFACES).optional(),
    isIndoor: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
});

const UPDATE_COURT_BODY = CREATE_COURT_BODY.partial().extend({
    // Retire / reinstate. Courts are never deleted so past bookings keep resolving.
    isActive: z.boolean().optional(),
});

const LIST_COURTS_QUERY = z.object({
    includeInactive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});

const DUPLICATE_NAME = { error: 'This venue already has a court with that name' };

/** GET /venues/:venueId/courts — active courts in display order; ?includeInactive=true for retired too */
courtsRouter.get('/', requireAuth, async (request, response) => {
    const parsed = LIST_COURTS_QUERY.safeParse(request.query);

    if (!parsed.success) return badRequest(response, 'Invalid query', parsed.error);

    const venueId = String(request.params.venueId);

    if (!(await venueService.getById(venueId))) {
        response.status(404).json({ error: 'Venue not found' });

        return;
    }

    const courts = await courtService.listByVenue(venueId, parsed.data);

    response.json({ items: courts.map(publicCourt) });
});

/** POST /venues/:venueId/courts — venue admin+, or organisation admin+ */
courtsRouter.post('/', requireAuth, requireRole(ScopeType.Venue, 'venueId', Role.Admin), async (request, response) => {
    const parsed = CREATE_COURT_BODY.safeParse(request.body);

    if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

    try {
        const court = await courtService.createForVenue(String(request.params.venueId), parsed.data, request.userId!);

        response.status(201).json(publicCourt(court));
    } catch (error) {
        if (isDuplicateKey(error)) {
            response.status(409).json(DUPLICATE_NAME);

            return;
        }

        throw error;
    }
});

/** GET /venues/:venueId/courts/:courtId */
courtsRouter.get('/:courtId', requireAuth, async (request, response) => {
    const court = await courtService.getForVenue(String(request.params.venueId), String(request.params.courtId));

    if (!court) {
        response.status(404).json({ error: 'Court not found' });

        return;
    }

    response.json(publicCourt(court));
});

/** PATCH /venues/:venueId/courts/:courtId — venue admin+, or organisation admin+ */
courtsRouter.patch('/:courtId', requireAuth, requireRole(ScopeType.Venue, 'venueId', Role.Admin), async (request, response) => {
    const parsed = UPDATE_COURT_BODY.safeParse(request.body);

    if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

    try {
        // Scoped to the venue in the URL, which is the one requireRole just authorised.
        const court = await courtService.updateForVenue(
            String(request.params.venueId),
            String(request.params.courtId),
            parsed.data,
        );

        if (!court) {
            response.status(404).json({ error: 'Court not found' });

            return;
        }

        response.json(publicCourt(court));
    } catch (error) {
        if (isDuplicateKey(error)) {
            response.status(409).json(DUPLICATE_NAME);

            return;
        }

        throw error;
    }
});
