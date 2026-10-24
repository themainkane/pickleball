import { Schema, model, InferSchemaType, HydratedDocument, Types } from 'mongoose';

const userSchema = new Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true, select: false },
        userName: { type: String, required: true, trim: true, maxlength: 60 },
        rating: { type: Number, min: 0, max: 8 },
        clubId: { type: Schema.Types.ObjectId, ref: 'Club', index: true },
        teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    },
    {
        timestamps: true,
    },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;
export type UserLean = User & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export const UserModel = model('User', userSchema);
