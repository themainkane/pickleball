import { Types } from 'mongoose';
import { BaseService } from './BaseService';
import { membershipService } from './MembershipService';
import { withTransaction } from '../db/transaction';
import { ClubModel, type Club } from '../models/Club';
import { ScopeType } from '../models/Membership';

export type CreateClubInput = {
    name: string;
    organisationId?: string;
    homeVenueId?: string;
};

/** Fields a club admin may change. Which organisation runs the club is deliberately not one. */
export type UpdateClubInput = {
    name?: string;
    homeVenueId?: string;
};

export class ClubService extends BaseService<Club> {
    constructor() {
        super(ClubModel);
    }

    /** Creates the club and makes the creator its owner, atomically. */
    async createWithOwner({ organisationId, homeVenueId, ...rest }: CreateClubInput, creatorUserId: string) {
        return withTransaction(async () => {
            const club = await this.create({
                ...rest,
                ...(organisationId ? { organisationId: new Types.ObjectId(organisationId) } : {}),
                ...(homeVenueId ? { homeVenueId: new Types.ObjectId(homeVenueId) } : {}),
                createdBy: new Types.ObjectId(creatorUserId),
            });

            await membershipService.addOwner(creatorUserId, { scopeType: ScopeType.Club, scopeId: String(club._id) });

            return club;
        });
    }

    async updateDetails(id: string, { homeVenueId, ...rest }: UpdateClubInput) {
        return this.updateById(id, {
            ...rest,
            ...(homeVenueId ? { homeVenueId: new Types.ObjectId(homeVenueId) } : {}),
        });
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

export const clubService = new ClubService();
