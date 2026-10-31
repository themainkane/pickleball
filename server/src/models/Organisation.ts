import { Schema, model, InferSchemaType, Types } from 'mongoose';

/** The business entity. People get access through Membership, never by logging in as it. */
const organisationSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true },
);

export type Organisation = InferSchemaType<typeof organisationSchema>;
export type OrganisationLean = Organisation & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export const OrganisationModel = model('Organisation', organisationSchema);
