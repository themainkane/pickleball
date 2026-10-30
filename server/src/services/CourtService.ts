import { Types } from 'mongoose';
import { BaseService } from './BaseService';
import { CourtModel, type Court, type Surface } from '../models/Court';

export type CreateCourtInput = {
    name: string;
    surface?: Surface;
    isIndoor?: boolean;
    sortOrder?: number;
};

/** Fields a venue admin may change. Moving a court to another venue is deliberately not one. */
export type UpdateCourtInput = {
    name?: string;
    surface?: Surface;
    isIndoor?: boolean;
    isActive?: boolean;
    sortOrder?: number;
};

export class CourtService extends BaseService<Court> {
    constructor() {
        super(CourtModel);
    }

    async createForVenue(venueId: string, input: CreateCourtInput, creatorUserId: string) {
        return this.create({
            ...input,
            venueId: new Types.ObjectId(venueId),
            createdBy: new Types.ObjectId(creatorUserId),
        });
    }

    /**
     * Only finds the court if it belongs to this venue. Routes authorise against the
     * venue in the URL, so looking a court up by id alone would let an admin of one
     * venue edit another venue's courts.
     */
    async getForVenue(venueId: string, courtId: string) {
        if (!Types.ObjectId.isValid(venueId) || !Types.ObjectId.isValid(courtId)) return null;

        return this.model
            .findOne({ _id: new Types.ObjectId(courtId), venueId: new Types.ObjectId(venueId) })
            .lean()
            .exec();
    }

    async updateForVenue(venueId: string, courtId: string, patch: UpdateCourtInput) {
        if (!Types.ObjectId.isValid(venueId) || !Types.ObjectId.isValid(courtId)) return null;

        return this.model
            .findOneAndUpdate(
                { _id: new Types.ObjectId(courtId), venueId: new Types.ObjectId(venueId) },
                patch,
                { new: true, runValidators: true },
            )
            .lean()
            .exec();
    }

    /** A venue has few courts, so no pagination. Retired courts only when asked for. */
    async listByVenue(venueId: string, { includeInactive = false }: { includeInactive?: boolean } = {}) {
        if (!Types.ObjectId.isValid(venueId)) return [];

        return this.model
            .find({ venueId: new Types.ObjectId(venueId), ...(includeInactive ? {} : { isActive: true }) })
            .sort({ sortOrder: 1, name: 1 })
            .lean()
            .exec();
    }
}

export const courtService = new CourtService();
