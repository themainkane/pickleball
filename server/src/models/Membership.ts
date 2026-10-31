import { Schema, model, InferSchemaType } from 'mongoose';
import type { Lean } from './lean';

export enum ScopeType {
    Organisation = 'organisation',
    Venue = 'venue',
    Club = 'club',
}

/**
 *  - Member: belongs (e.g. plays at a club)
 *  - Staff:  day-to-day operations (later: run sessions, take bookings)
 *  - Admin:  manages settings and people below admin
 *  - Owner:  everything, including granting admin/owner
 */
export enum Role {
    Member = 'member',
    Staff = 'staff',
    Admin = 'admin',
    Owner = 'owner',
}
export enum RoleRank {
    Member = 10,
    Staff = 20,
    Admin = 30,
    Owner = 40,
}

const RANK_BY_ROLE: Record<Role, RoleRank> = {
    [Role.Member]: RoleRank.Member,
    [Role.Staff]: RoleRank.Staff,
    [Role.Admin]: RoleRank.Admin,
    [Role.Owner]: RoleRank.Owner,
};

export function roleRank(role: Role): RoleRank {
    return RANK_BY_ROLE[role];
}

export function isAtLeast(role: Role | null, minimumRole: Role): boolean {
    return role !== null && roleRank(role) >= roleRank(minimumRole);
}

/**
 * One row per (user, thing they belong to). This is the only place roles live, so a
 * single user can own an organisation, run a venue, admin one club and play in two
 * others without needing separate accounts.
 */
const membershipSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        scopeType: { type: String, enum: Object.values(ScopeType), required: true },
        scopeId: { type: Schema.Types.ObjectId, required: true },
        role: { type: String, enum: Object.values(Role), required: true },
    },
    { timestamps: true },
);

// One membership per user per scope; also serves "what does this user belong to".
membershipSchema.index({ userId: 1, scopeType: 1, scopeId: 1 }, { unique: true });
// "Who belongs to this scope", optionally by role (e.g. counting owners).
membershipSchema.index({ scopeType: 1, scopeId: 1, role: 1 });

export type Membership = InferSchemaType<typeof membershipSchema>;
export type MembershipLean = Lean<Membership>;

export const MembershipModel = model('Membership', membershipSchema);
