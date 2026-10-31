import bcrypt from 'bcrypt';
import { BaseService } from './BaseService';
import { UserModel, type User, type UserLean, type UserWithPasswordHash } from '../models/User';
import {randomBytes} from "node:crypto";
import { authService } from './AuthService';

const SALT_ROUNDS = 12;

export type CreateUserInput = {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    rating?: number;
};

/** fields a user is allowed to change about themselves */
export type UpdateUserInput = {
    firstName?: string;
    lastName?: string;
    rating?: number;
};

export class UserService extends BaseService<User, UserLean> {
    // timings are the same for missing emails,
    // attackers cannot phish emails of users.
    private dummyHashPromise: Promise<string> | null = null;

    constructor() {
        super(UserModel);
    }

    /** The hash is stripped before returning, so it never leaves this service. */
    async register({ password, ...rest }: CreateUserInput): Promise<UserLean> {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // create() returns the document it just wrote, which does still hold the hash.
        const created = await this.create({ ...rest, passwordHash }) as UserWithPasswordHash;
        const { passwordHash: _hash, ...safe } = created;

        return safe;
    }

    /**
     * Narrower than the inherited `updateById`, which takes `Partial<User>` and would
     * happily let a controller overwrite `passwordHash` or `email`.
     */
    async updateProfile(id: string, patch: UpdateUserInput): Promise<UserLean | null> {
        return this.updateById(id, patch);
    }

    async findByEmail(email: string): Promise<UserLean | null> {
        return this.model.findOne({ email: email.toLowerCase() }).lean().exec();
    }


    async verifyCredentials(email: string, password: string): Promise<UserLean | null> {
        const dummyHash = await this.getDummyHash();
        const user = await this.model
            .findOne({ email: email.toLowerCase() })
            // hash always excluded, explicitly select it
            .select('+passwordHash')
            .lean<UserWithPasswordHash | null>()
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

    async changePassword(id: string, newPassword: string): Promise<UserLean | null> {
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        const updated = await this.updateById(id, { passwordHash });

        // A password change must kill every existing session, including a stolen one.
        if (updated) await authService.revokeAllForUser(id);

        return updated;
    }

    private getDummyHash() {
        this.dummyHashPromise ??= bcrypt.hash(randomBytes(32).toString('hex'), SALT_ROUNDS);

        return this.dummyHashPromise;
    }
}

export const userService = new UserService();
