import { Schema, model, InferSchemaType } from 'mongoose';
import type { Lean } from './lean';

/** A physical site. Always belongs to exactly one organisation. */
const venueSchema = new Schema(
    {
        organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        address: { type: String, trim: true, maxlength: 300 },
        // IANA name, e.g. "Pacific/Auckland".
        timezone: { type: String, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true },
);

export type Venue = InferSchemaType<typeof venueSchema>;
export type VenueLean = Lean<Venue>;

export const VenueModel = model('Venue', venueSchema);
