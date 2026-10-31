import type { MemberWithUser, UserMembershipSummary } from '../services/MembershipService';

/** A row in a scope's member list. */
export function publicMember(member: MemberWithUser) {
    return {
        userId: member.userId ? String(member.userId._id) : null,
        firstName: member.userId?.firstName ?? null,
        lastName: member.userId?.lastName ?? null,
        role: member.role,
        joinedAt: member.createdAt,
    };
}

/** A row in "what do I belong to". */
export function userMembership(membership: UserMembershipSummary) {
    return {
        scopeType: membership.scopeType,
        scopeId: String(membership.scopeId),
        scopeName: membership.scopeName,
        role: membership.role,
    };
}
