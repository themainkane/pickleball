import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { requireSuperuser } from '../middleware/requireSuperuser';
import { Role, ScopeType } from '../models/Membership';
import { clubService } from '../services/ClubService';
import { organisationService } from '../services/OrganisationService';
import { userService } from '../services/UserService';
import { venueService } from '../services/VenueService';
import { publicClub } from '../steralizers/clubSerializer';
import { publicOrganisation } from '../steralizers/organisationSerializer';
import { publicVenue } from '../steralizers/venueSerializer';
import { createMembersRouter } from './members';
import { badRequest, LIST_QUERY_SCHEMA, OBJECT_ID_SCHEMA } from './routeHelpers';
import { CREATE_VENUE_FIELDS } from './venues';

export const organisationsRouter = Router();

const CREATE_ORGANISATION_BODY = z.object({
    name: z.string().trim().min(1).max(120),
});

const CREATE_ORGANISATION_REQUEST = CREATE_ORGANISATION_BODY.extend({
    ownerUserId: OBJECT_ID_SCHEMA,
});

const UPDATE_ORGANISATION_BODY = CREATE_ORGANISATION_BODY.partial();

/** POST /organisations — superuser only; `ownerUserId` becomes the owner */
organisationsRouter.post('/', requireAuth, requireSuperuser, async (request, response) => {
    const parsed = CREATE_ORGANISATION_REQUEST.safeParse(request.body);

    if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

    const { ownerUserId, ...details } = parsed.data;

    if (!(await userService.getById(ownerUserId))) {
        response.status(400).json({ error: 'Owner user not found' });

        return;
    }

    const organisation = await organisationService.createWithOwner(details, ownerUserId, request.userId!);

    response.status(201).json(publicOrganisation(organisation));
});

/** GET /organisations/:organisationId */
organisationsRouter.get('/:organisationId', requireAuth, async (request, response) => {
    const organisation = await organisationService.getById(String(request.params.organisationId));

    if (!organisation) {
        response.status(404).json({ error: 'Organisation not found' });

        return;
    }

    response.json(publicOrganisation(organisation));
});

/** PATCH /organisations/:organisationId — admin+ */
organisationsRouter.patch(
    '/:organisationId',
    requireAuth,
    requireRole(ScopeType.Organisation, 'organisationId', Role.Admin),
    async (request, response) => {
        const parsed = UPDATE_ORGANISATION_BODY.safeParse(request.body);

        if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

        const organisation = await organisationService.updateDetails(String(request.params.organisationId), parsed.data);

        response.json(publicOrganisation(organisation!));
    },
);

/** GET /organisations/:organisationId/venues */
organisationsRouter.get('/:organisationId/venues', requireAuth, async (request, response) => {
    const parsed = LIST_QUERY_SCHEMA.safeParse(request.query);

    if (!parsed.success) return badRequest(response, 'Invalid query', parsed.error);

    const { items, hasMore } = await venueService.listByOrganisation(String(request.params.organisationId), parsed.data);

    response.json({ items: items.map(publicVenue), hasMore });
});

/** POST /organisations/:organisationId/venues — admin+; the caller becomes venue owner */
organisationsRouter.post(
    '/:organisationId/venues',
    requireAuth,
    requireRole(ScopeType.Organisation, 'organisationId', Role.Admin),
    async (request, response) => {
        const parsed = CREATE_VENUE_FIELDS.safeParse(request.body);

        if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);

        const venue = await venueService.createWithOwner(
            { ...parsed.data, organisationId: String(request.params.organisationId) },
            request.userId!,
        );

        response.status(201).json(publicVenue(venue));
    },
);

/** GET /organisations/:organisationId/clubs — clubs this organisation runs */
organisationsRouter.get('/:organisationId/clubs', requireAuth, async (request, response) => {
    const parsed = LIST_QUERY_SCHEMA.safeParse(request.query);

    if (!parsed.success) return badRequest(response, 'Invalid query', parsed.error);

    const { items, hasMore } = await clubService.listByOrganisation(String(request.params.organisationId), parsed.data);

    response.json({ items: items.map(publicClub), hasMore });
});

organisationsRouter.use('/:organisationId/members', createMembersRouter(ScopeType.Organisation, 'organisationId'));
