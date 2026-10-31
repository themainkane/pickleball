import type { VenueLean } from '../models/Venue';

type SerializableVenue = Pick<VenueLean, '_id' | 'organisationId' | 'name' | 'address' | 'timezone' | 'createdAt'>;

export function publicVenue(venue: SerializableVenue) {
    return {
        id: String(venue._id),
        organisationId: String(venue.organisationId),
        name: venue.name,
        address: venue.address ?? null,
        timezone: venue.timezone,
        createdAt: venue.createdAt,
    };
}
