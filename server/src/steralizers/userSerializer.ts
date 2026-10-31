import type { UserLean} from '../models/User';

type SerializableUser = Pick<UserLean,
    '_id' | 'firstName' | 'lastName' | 'rating' | 'email' | 'createdAt'>;

export function publicUser(user: SerializableUser) {
    return {
        id: String(user._id),
        firstName: user.firstName,
        lastName: user.lastName,
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
