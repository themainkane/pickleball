import { Types } from 'mongoose';
import { BaseService } from './BaseService';
import { withTransaction } from '../db/transaction';
import { ClubModel } from '../models/Club';
import {
    MembershipModel,
    isAtLeast,
    roleRank,
    type Membership,
    Role,
    ScopeType,
} from '../models/Membership';
import { OrganisationModel } from '../models/Organisation';
import type { UserLean } from '../models/User';
import { VenueModel } from '../models/Venue';
import { isDuplicateKey } from '../routes/routeHelpers';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export type Scope = { scopeType: ScopeType; scopeId: string };

/** Who is making the change, and the role they hold in the scope being changed. */
export type Actor = { userId: string; role: Role };

export type MembershipChangeResult =
    | { ok: true }
    | { ok: false; reason: 'not_found' | 'forbidden' | 'last_owner' | 'already_member' };

export type MemberWithUser = {
    _id: Types.ObjectId;
    role: Role;
    createdAt: Date;
    userId: Pick<UserLean, '_id' | 'firstName' | 'lastName'> | null;
};

export type UserMembershipSummary = {
    scopeType: ScopeType;
    scopeId: Types.ObjectId;
    scopeName: string | null;
    role: Role;
};

function toObjectId(id: string) {
    return new Types.ObjectId(id);
}

/** Owners can grant anything; everyone else can only grant roles strictly below their own. */
function canGrant(actorRole: Role, roleToGrant: Role) {
    return actorRole === Role.Owner || roleRank(actorRole) > roleRank(roleToGrant);
}

/** Owners can change anyone; everyone else only people strictly below them. */
function canManage(actorRole: Role, targetRole: Role) {
    return actorRole === Role.Owner || roleRank(actorRole) > roleRank(targetRole);
}

export class MembershipService extends BaseService<Membership> {
    constructor() {
        super(MembershipModel);
    }

    async scopeExists({ scopeType, scopeId }: Scope) {
        if (!Types.ObjectId.isValid(scopeId)) return false;

        switch (scopeType) {
            case ScopeType.Organisation:
                return (await OrganisationModel.exists({ _id: scopeId })) !== null;
            case ScopeType.Venue:
                return (await VenueModel.exists({ _id: scopeId })) !== null;
            case ScopeType.Club:
                return (await ClubModel.exists({ _id: scopeId })) !== null;
        }
    }

    /**
     * The strongest role the user holds in this scope: their own membership, or an
     * admin/owner role inherited from the organisation that runs the venue or club.
     * Plain organisation members and staff don't inherit anything.
     */
    async getEffectiveRole(userId: string, scope: Scope): Promise<Role | null> {
        if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(scope.scopeId)) return null;

        const direct = await this.findMembership(userId, scope);
        let strongest: Role | null = direct?.role ?? null;

        const organisationId = await this.parentOrganisationId(scope);

        if (organisationId) {
            const inherited = await this.findMembership(userId, {
                scopeType: ScopeType.Organisation,
                scopeId: String(organisationId),
            });

            if (inherited && isAtLeast(inherited.role, Role.Admin) && !isAtLeast(strongest, inherited.role)) {
                strongest = inherited.role;
            }
        }

        return strongest;
    }

    /** Used when creating an organisation/venue/club so the creator becomes its owner. */
    async addOwner(userId: string, scope: Scope) {
        return this.create({
            userId: toObjectId(userId),
            scopeType: scope.scopeType,
            scopeId: toObjectId(scope.scopeId),
            role: Role.Owner,
        });
    }

    async addMember(actor: Actor, scope: Scope, targetUserId: string, role: Role): Promise<MembershipChangeResult> {
        if (!canGrant(actor.role, role)) return { ok: false, reason: 'forbidden' };

        try {
            await this.create({
                userId: toObjectId(targetUserId),
                scopeType: scope.scopeType,
                scopeId: toObjectId(scope.scopeId),
                role,
            });
        } catch (error) {
            if (isDuplicateKey(error)) return { ok: false, reason: 'already_member' };

            throw error;
        }

        return { ok: true };
    }

    async changeRole(actor: Actor, scope: Scope, targetUserId: string, newRole: Role): Promise<MembershipChangeResult> {
        return withTransaction(async (): Promise<MembershipChangeResult> => {
            const target = await this.findMembership(targetUserId, scope);

            if (!target) return { ok: false, reason: 'not_found' };

            if (!canManage(actor.role, target.role) || !canGrant(actor.role, newRole)) {
                return { ok: false, reason: 'forbidden' };
            }

            if (target.role === Role.Owner && newRole !== Role.Owner && (await this.isLastOwner(scope))) {
                return { ok: false, reason: 'last_owner' };
            }

            await this.updateById(String(target._id), { role: newRole });

            return { ok: true };
        });
    }

    /** Removes someone else (needs to outrank them) or yourself (leaving). */
    async removeMember(actor: Actor, scope: Scope, targetUserId: string): Promise<MembershipChangeResult> {
        return withTransaction(async (): Promise<MembershipChangeResult> => {
            const target = await this.findMembership(targetUserId, scope);

            if (!target) return { ok: false, reason: 'not_found' };

            const isLeaving = actor.userId === targetUserId;

            if (!isLeaving && !canManage(actor.role, target.role)) return { ok: false, reason: 'forbidden' };

            if (target.role === Role.Owner && (await this.isLastOwner(scope))) {
                return { ok: false, reason: 'last_owner' };
            }

            await this.deleteById(String(target._id));

            return { ok: true };
        });
    }

    async listMembers(scope: Scope, { limit = DEFAULT_LIMIT, skip = 0 }: { limit?: number; skip?: number } = {}) {
        const capped = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

        const memberships = await this.model
            .find({ scopeType: scope.scopeType, scopeId: toObjectId(scope.scopeId) })
            .sort({ _id: 1 })
            .skip(Math.max(Number(skip) || 0, 0))
            .limit(capped + 1) // one extra to detect hasMore, no count query
            .populate<{ userId: MemberWithUser['userId'] }>('userId', 'firstName lastName')
            .lean()
            .exec();

        return {
            items: memberships.slice(0, capped) as MemberWithUser[],
            hasMore: memberships.length > capped,
        };
    }

    /** Everything a user belongs to, with names, so a client can build a "manage" menu. */
    async listForUser(userId: string): Promise<UserMembershipSummary[]> {
        if (!Types.ObjectId.isValid(userId)) return [];

        const memberships = await this.model.find({ userId: toObjectId(userId) }).lean().exec();

        const idsByType = (scopeType: ScopeType) =>
            memberships.filter((membership) => membership.scopeType === scopeType).map((membership) => membership.scopeId);

        // One query per type rather than one per membership.
        const [organisations, venues, clubs] = await Promise.all([
            OrganisationModel.find({ _id: { $in: idsByType(ScopeType.Organisation) } }, 'name').lean().exec(),
            VenueModel.find({ _id: { $in: idsByType(ScopeType.Venue) } }, 'name').lean().exec(),
            ClubModel.find({ _id: { $in: idsByType(ScopeType.Club) } }, 'name').lean().exec(),
        ]);

        const names = new Map<string, string>();

        for (const scope of [...organisations, ...venues, ...clubs]) {
            names.set(String(scope._id), scope.name);
        }

        return memberships.map((membership) => ({
            scopeType: membership.scopeType,
            scopeId: membership.scopeId,
            scopeName: names.get(String(membership.scopeId)) ?? null,
            role: membership.role,
        }));
    }

    private async findMembership(userId: string, { scopeType, scopeId }: Scope) {
        if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(scopeId)) return null;

        return this.model
            .findOne({ userId: toObjectId(userId), scopeType, scopeId: toObjectId(scopeId) })
            .lean()
            .exec();
    }

    /**
     * Call inside withTransaction, before demoting or removing an owner.
     *
     * A transaction alone isn't enough here. Two owners demoting each other at once
     * each write a *different* document, so neither transaction conflicts with the
     * other, both counts say "2 owners", and both commit — leaving none. So first
     * touch every owner row in the scope: now the two transactions write the same
     * documents, Mongo rejects the second with a write conflict, withTransaction
     * retries it, and the retry sees only one owner left.
     */
    private async isLastOwner({ scopeType, scopeId }: Scope) {
        const ownersFilter = { scopeType, scopeId: toObjectId(scopeId), role: Role.Owner };

        await this.model.updateMany(ownersFilter, { $currentDate: { updatedAt: true } }, { timestamps: false }).exec();

        const ownerCount = await this.model.countDocuments(ownersFilter).exec();

        return ownerCount <= 1;
    }

    private async parentOrganisationId({ scopeType, scopeId }: Scope) {
        switch (scopeType) {
            case ScopeType.Organisation:
                return null;
            case ScopeType.Venue:
                return (await VenueModel.findById(scopeId, 'organisationId').lean().exec())?.organisationId ?? null;
            case ScopeType.Club:
                return (await ClubModel.findById(scopeId, 'organisationId').lean().exec())?.organisationId ?? null;
        }
    }
}

export const membershipService = new MembershipService();
