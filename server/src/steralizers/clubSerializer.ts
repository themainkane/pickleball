import type { ClubLean } from '../models/Club';

type SerializableClub = Pick<ClubLean, '_id' | 'name' | 'organisationId' | 'homeVenueId' | 'createdAt'>;

export function publicClub(club: SerializableClub) {
    return {
        id: String(club._id),
        name: club.name,
        organisationId: club.organisationId ? String(club.organisationId) : null,
        homeVenueId: club.homeVenueId ? String(club.homeVenueId) : null,
        createdAt: club.createdAt,
    };
}
