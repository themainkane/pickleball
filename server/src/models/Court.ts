import { Schema, model, InferSchemaType, Types } from 'mongoose';

export const SURFACES = ['hard', 'acrylic', 'concrete', 'asphalt', 'wood', 'synthetic', 'grass', 'clay'] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * One bookable court at a venue. Its own collection (not an array on Venue) because
 * bookings reference it directly, it has its own lifecycle, and later each court's
 * document is what a booking transaction locks to stop double bookings.
 *
 * Never hard-deleted: retire with `isActive: false` so past bookings still resolve.
 */
const courtSchema = new Schema(
    {
        venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
        name: { type: String, required: true, trim: true, maxlength: 60 },
        surface: { type: String, enum: SURFACES },
        isIndoor: { type: Boolean, required: true, default: false },
        isActive: { type: Boolean, required: true, default: true },
        // Display order, so "Court 10" doesn't sort before "Court 2".
        sortOrder: { type: Number, required: true, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true },
);

// No two "Court 1"s at one venue; also serves "courts for this venue".
courtSchema.index({ venueId: 1, name: 1 }, { unique: true });

export type Court = InferSchemaType<typeof courtSchema>;
export type CourtLean = Court & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export const CourtModel = model('Court', courtSchema);
