import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * One row per issued refresh token. Only a SHA-256 of the token is stored, so a DB
 * leak doesn't hand out live sessions.
 *
 * A "family" is one login on one device. Each refresh rotates the token: the old row
 * is revoked, a new row is created with the same familyId. If a revoked token is ever
 * presented again, someone has a stolen copy, so the whole family is revoked.
 */
const refreshTokenSchema = new Schema(
    {
        tokenHash: { type: String, required: true, unique: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        familyId: { type: String, required: true, index: true },
        // Mongo's TTL monitor deletes rows once this passes. Revoked rows are kept
        // until then so reuse can still be detected.
        expiresAt: { type: Date, required: true, expires: 0 },
        revokedAt: { type: Date, default: null },
        userAgent: { type: String, maxlength: 300 },
    },
    { timestamps: true },
);

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;

export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
