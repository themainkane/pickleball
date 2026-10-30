import { Types } from 'mongoose';
import { BaseService } from './BaseService';
import { membershipService } from './MembershipService';
import { withTransaction } from '../db/transaction';
import { VenueModel, type Venue } from '../models/Venue';
import { ScopeType } from '../models/Membership';

export type CreateVenueInput = {
    organisationId: string;
    name: string;
    address?: string;
    timezone: string;
};

/** Fields a venue admin may change. Moving a venue to another organisation is deliberately not one. */
export type UpdateVenueInput = {
    name?: string;
    address?: string;
    timezone?: string;
};

export class VenueService extends BaseService<Venue> {
    constructor() {
        super(VenueModel);
    }

    async createWithOwner({ organisationId, ...rest }: CreateVenueInput, creatorUserId: string) {
        return withTransaction(async () => {
            const venue = await this.create({
                ...rest,
                organisationId: new Types.ObjectId(organisationId),
                createdBy: new Types.ObjectId(creatorUserId),
            });

            await membershipService.addOwner(creatorUserId, { scopeType: ScopeType.Venue, scopeId: String(venue._id) });

            return venue;
        });
    }

    async updateDetails(id: string, patch: UpdateVenueInput) {
        return this.updateById(id, patch);
    }

    async listByOrganisation(organisationId: string, { limit, skip }: { limit?: number; skip?: number } = {}) {
        if (!Types.ObjectId.isValid(organisationId)) return { items: [], hasMore: false };

        return this.list({
            filter: { organisationId: new Types.ObjectId(organisationId) },
            limit,
            skip,
            sort: { name: 1 },
        });
    }
}

export const venueService = new VenueService();
