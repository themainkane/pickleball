import type { UserLean} from '../models/User';

type SerializableUser = Pick<UserLean,
    '_id' | 'userName' | 'rating' | 'email' | 'createdAt'>;

export function publicUser(user: SerializableUser) {
    return {
        id: String(user._id),
        displayName: user.userName,
        rating: user.rating ?? null,
    };
}


export function privateUser(user: SerializableUser) {
    return {
        ...publicUser(user),
        email: user.email,
        createdAt: user.createdAt,
    };
}
