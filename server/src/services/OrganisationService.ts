import { Types } from 'mongoose';
import { BaseService } from './BaseService';
import { membershipService } from './MembershipService';
import { withTransaction } from '../db/transaction';
import { OrganisationModel, type Organisation } from '../models/Organisation';
import { ScopeType } from '../models/Membership';

export type CreateOrganisationInput = { name: string };

/** Fields an organisation admin may change. */
export type UpdateOrganisationInput = { name?: string };

export class OrganisationService extends BaseService<Organisation> {
    constructor() {
        super(OrganisationModel);
    }

    /**
     * Creates the organisation and makes `ownerUserId` its owner, atomically.
     * `createdByUserId` is whoever set it up (a superuser) and gets no membership.
     */
    async createWithOwner(input: CreateOrganisationInput, ownerUserId: string, createdByUserId: string) {
        return withTransaction(async () => {
            const organisation = await this.create({ ...input, createdBy: new Types.ObjectId(createdByUserId) });

            await membershipService.addOwner(ownerUserId, { scopeType: ScopeType.Organisation, scopeId: String(organisation._id) });

            return organisation;
        });
    }

    /** Narrower than `updateById`, so a route can't overwrite `createdBy`. */
    async updateDetails(id: string, patch: UpdateOrganisationInput) {
        return this.updateById(id, patch);
    }
}

export const organisationService = new OrganisationService();
