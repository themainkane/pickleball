import type { CourtLean } from '../models/Court';

type SerializableCourt = Pick<CourtLean,
    '_id' | 'venueId' | 'name' | 'surface' | 'isIndoor' | 'isActive' | 'sortOrder' | 'createdAt'>;

export function publicCourt(court: SerializableCourt) {
    return {
        id: String(court._id),
        venueId: String(court.venueId),
        name: court.name,
        surface: court.surface ?? null,
        isIndoor: court.isIndoor,
        isActive: court.isActive,
        sortOrder: court.sortOrder,
        createdAt: court.createdAt,
    };
}
