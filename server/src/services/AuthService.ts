import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import type { UserLean } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';

const accessPayload = z.object({
    sub: z.string(),
});

export type AccessTokenPayload = z.infer<typeof accessPayload>;

const ALGORITHM = 'HS256' as const;

export type IssuedRefreshToken = { token: string; expiresAt: Date };

export type RotateResult =
    | { ok: true; userId: string; refresh: IssuedRefreshToken }
    | { ok: false };

function hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

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

    public async issueRefreshToken(userId: string, userAgent?: string, familyId: string = randomUUID()) {
        // 256 bits of entropy; opaque, so it's useless without the DB row.
        const token = randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + env.REFRESH_EXPIRES_IN * 1000);

        await RefreshTokenModel.create({
            tokenHash: hashToken(token),
            userId: new Types.ObjectId(userId),
            familyId,
            expiresAt,
            userAgent: userAgent?.slice(0, 300),
        });

        return { token, expiresAt } satisfies IssuedRefreshToken;
    }

    // Two concurrent refreshes with the same token can't both succeed.
    public async rotateRefreshToken(token: string, userAgent?: string): Promise<RotateResult> {
        const tokenHash = hashToken(token);
        const now = new Date();

        const claimed = await RefreshTokenModel.findOneAndUpdate(
            { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
            { $set: { revokedAt: now } },
        ).lean().exec();

        if (claimed) {
            const refresh = await this.issueRefreshToken(String(claimed.userId), userAgent, claimed.familyId);

            return { ok: true, userId: String(claimed.userId), refresh };
        }

        // Not claimable. If it exists but was already revoked, it's being replayed:
        // assume theft and kill every token in that login's family.
        const existing = await RefreshTokenModel.findOne({ tokenHash }).lean().exec();

        if (existing?.revokedAt) {
            await this.revokeFamily(existing.familyId);
        }

        return { ok: false };
    }

    /** Logout on this device. */
    public async revokeRefreshToken(token: string) {
        const existing = await RefreshTokenModel.findOne({ tokenHash: hashToken(token) }).lean().exec();

        if (existing) await this.revokeFamily(existing.familyId);
    }

    /** Logout everywhere — use after a password change too. */
    public async revokeAllForUser(userId: string) {
        await RefreshTokenModel.updateMany(
            { userId: new Types.ObjectId(userId), revokedAt: null },
            { $set: { revokedAt: new Date() } },
        ).exec();
    }

    private async revokeFamily(familyId: string) {
        await RefreshTokenModel.updateMany(
            { familyId, revokedAt: null },
            { $set: { revokedAt: new Date() } },
        ).exec();
    }
}

export const authService = new AuthService();
