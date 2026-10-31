import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { Role, ScopeType } from '../models/Membership';
import { venueService } from '../services/VenueService';
import { publicVenue } from '../serializers/venueSerializer';
import { createMembersRouter } from './members';
import { courtsRouter } from './courts';
import { badRequest } from './routeHelpers';

export const venuesRouter = Router();

function isValidTimezone(timezone: string) {
    try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });

        return true;
    } catch {
        return false;
    }
}

/** Venues are created under their organisation: POST /organisations/:organisationId/venues */
export const CREATE_VENUE_FIELDS = z.object({
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(300).optional(),
    timezone: z.string().refine(isValidTimezone, 'Must be an IANA timezone, e.g. Pacific/Auckland'),
});

const UPDATE_VENUE_BODY = CREATE_VENUE_FIELDS.partial();

/** GET /venues/:venueId */
venuesRouter.get('/:venueId', requireAuth, async (request, response) => {
    const venue = await venueService.getById(String(request.params.venueId));

    if (!venue) {
        response.status(404).json({ error: 'Venue not found' });

        return;
    }

    response.json(publicVenue(venue));
});

/** PATCH /venues/:venueId — venue admin+, or organisation admin+ */
venuesRouter.patch('/:venueId', requireAuth, requireRole(ScopeType.Venue, 'venueId', Role.Admin), async (request, response) => {
    const parsed = UPDATE_VENUE_BODY.safeParse(request.body);

    if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

    const venue = await venueService.updateDetails(String(request.params.venueId), parsed.data);

    if (!venue) {
        response.status(404).json({ error: 'Venue not found' });

        return;
    }

    response.json(publicVenue(venue));
});

venuesRouter.use('/:venueId/members', createMembersRouter(ScopeType.Venue, 'venueId'));
venuesRouter.use('/:venueId/courts', courtsRouter);
