import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { BaseService } from './BaseService';
import { UserModel, type User } from '../models/User';
import {randomBytes} from "node:crypto";

const SALT_ROUNDS = 12;

export type CreateUserInput = {
    email: string;
    password: string;
    userName: string;
    rating?: number;
    clubId?: string;
};

/** fields a user is allowed to change about themselves */
export type UpdateUserInput = {
    userName?: string;
    rating?: number;
};

export class UserService extends BaseService<User> {
    constructor() {
        super(UserModel);
    }

    async register({ password, clubId, ...rest }: CreateUserInput) {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

       return await this.create({
            ...rest,
            passwordHash,
            ...(clubId ? { clubId: new Types.ObjectId(clubId) } : {}),
        });


    }

    /**
     * Narrower than the inherited `updateById`, which takes `Partial<User>` and would
     * happily let a controller overwrite `passwordHash` or `email`.
     */
    async updateProfile(id: string, patch: UpdateUserInput) {
        return this.updateById(id, patch);
    }

    async findByEmail(email: string) {
        return this.model.findOne({ email: email.toLowerCase() }).lean().exec();
    }


    async verifyCredentials(email: string, password: string) {
        const dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), SALT_ROUNDS);
        const user = await this.model
            .findOne({ email: email.toLowerCase() })
            // hash always excluded, explicitly select it
            .select('+passwordHash')
            .lean()
            .exec();

        if (!user) {
            // redundant compare, for timing security.
            await bcrypt.compare(password, dummyHash );

            return null;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);

        if (!validPassword) return null;

        const { passwordHash: _hash, ...safe } = user;

        return safe;
    }

    async changePassword(id: string, newPassword: string) {
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        return this.updateById(id, { passwordHash });
    }

    async listByClub(clubId: string, { limit, skip }: { limit?: number; skip?: number } = {}) {
        if (!Types.ObjectId.isValid(clubId)) return { items: [], hasMore: false };

        return this.list({
            filter: { clubId: new Types.ObjectId(clubId) },
            limit,
            skip,
            sort: { userName: 1 },
        });
    }
}

export const userService = new UserService();
