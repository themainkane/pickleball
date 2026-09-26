import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import type { UserLean } from '../models/User';

const accessPayload = z.object({
    sub: z.string(),
});

export type AccessTokenPayload = z.infer<typeof accessPayload>;

const ALGORITHM = 'HS256' as const;

export class AuthService {
    public signAccessToken(user: Pick<UserLean, '_id'>) {
        return jwt.sign({ sub: String(user._id) }, env.JWT_SECRET, {
            algorithm: ALGORITHM,
            expiresIn: env.JWT_EXPIRES_IN,
        });
    }

    public verifyAccessToken(token: string): AccessTokenPayload {
        const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });

        return accessPayload.parse(decoded);
    }
}

export const authService = new AuthService();
