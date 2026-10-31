import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import type { Lean } from './lean';

const userSchema = new Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true, select: false },
        firstName: { type: String, required: true, trim: true, maxlength: 60 },
        lastName: { type: String, required: true, trim: true, maxlength: 60 },
        rating: { type: Number, min: 0, max: 8 },
        // Platform-wide staff (e.g. creating organisations). Not an organisation role.
        // Never set from a request body; grant with `npm run set-superuser`.
        isSuperuser: { type: Boolean, required: true, default: false },
        // Clubs, organisations and venues a user belongs to live in Membership.
        // teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    },
    {
        timestamps: true,
    },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;

/**
 * A stored user as the rest of the app sees them. `passwordHash` is `select: false`, so
 * queries never return it: omitting it keeps the type honest about what's actually there
 * and stops the hash being serialized, logged or compared by accident.
 */
export type UserLean = Omit<Lean<User>, 'passwordHash'>;

/** Only the credential check, which explicitly selects the hash, gets this. */
export type UserWithPasswordHash = Lean<User>;

export const UserModel = model('User', userSchema);
