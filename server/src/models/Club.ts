import { Schema, model, InferSchemaType } from 'mongoose';
import type { Lean } from './lean';

/**
 * A group of players. Can be independent, or run by an organisation (whose admins
 * then also manage the club). `homeVenueId` is where it usually plays.
 */
const clubSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', index: true },
        homeVenueId: { type: Schema.Types.ObjectId, ref: 'Venue', index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true },
);

export type Club = InferSchemaType<typeof clubSchema>;
export type ClubLean = Lean<Club>;

export const ClubModel = model('Club', clubSchema);
