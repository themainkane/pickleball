import { Schema, model, InferSchemaType } from 'mongoose';
import type { Lean } from './lean';

/** Users get access through Membership, never by logging in as organisation */
const organisationSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true },
);

export type Organisation = InferSchemaType<typeof organisationSchema>;
export type OrganisationLean = Lean<Organisation>;

export const OrganisationModel = model('Organisation', organisationSchema);
