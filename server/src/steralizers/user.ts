// server/src/serializers/user.ts
import type { Types } from 'mongoose';
import type { User } from '../models/User';

type UserDoc = User & { _id: Types.ObjectId };


export function publicUser(user: UserDoc) {
    return {
        id: String(user._id),
        displayName: user.userName,
        rating: user.rating ?? null,
    };
}


export function privateUser(user: UserDoc) {
    return {
        ...publicUser(user),
        email: user.email,
        createdAt: user.createdAt,
    };
}
