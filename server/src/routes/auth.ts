import { Router, type CookieOptions, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { requireAuth } from '../middleware/requireAuth';
import { authService, type IssuedRefreshToken } from '../services/AuthService';
import { userService } from '../services/UserService';
import { privateUser } from '../steralizers/userSerializer';
import { isDuplicateKey } from './routeHelpers';

export const authRouter = Router();

// TODO: default store is in-memory. Resets on restart, not shared between
// processes. Fine on one box, wrong as soon as you run two instances.
const REGISTER_LIMITER = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });
const LOGIN_LIMITER = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
const REFRESH_LIMITER = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false });

const LOGIN_BODY = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(200),
});
const REGISTER_BODY = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(12).max(200),
    userName: z.string().trim().min(1).max(60),
});

const REFRESH_COOKIE = 'refresh_token';

/**
 * httpOnly: JS (and therefore XSS) can't read it.
 * sameSite strict: browser won't attach it to cross-site requests (CSRF).
 * path: only sent to /auth/*, not to every API call.
 * secure: HTTPS only outside dev
 */
function refreshCookieOptions(): CookieOptions {
    return {
        httpOnly: true,
        secure: env.NODE_ENV === 'live',
        sameSite: 'strict',
        path: env.REFRESH_COOKIE_PATH,
    };
}

function setRefreshCookie(res: Response, refresh: IssuedRefreshToken) {
    res.cookie(REFRESH_COOKIE, refresh.token, { ...refreshCookieOptions(), expires: refresh.expiresAt });
}

function clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

/**
 * Defence in depth on cookie-authenticated endpoints. A custom header can't be set by a
 * plain cross-site form post, and cross-origin fetch with it needs a CORS preflight we
 * never approve.
 */
function requireCsrfHeader(req: Request, res: Response, next: NextFunction) {
    if (req.get('x-requested-with') !== 'fetch') {
        res.status(403).json({ error: 'Missing X-Requested-With header' });

        return;
    }

    next();
}

function badBody(res: Response, error: z.ZodError) {
    res.status(400).json({ error: 'Invalid body', details: error.flatten().fieldErrors });
}

authRouter.post('/login', LOGIN_LIMITER, async (req, res) => {
    const parsed = LOGIN_BODY.safeParse(req.body);

    if (!parsed.success) return badBody(res, parsed.error);

    const { email, password } = parsed.data;
    const user = await userService.verifyCredentials(email, password);

    if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });

        return;
    }

    const refresh = await authService.issueRefreshToken(String(user._id), req.get('user-agent'));

    setRefreshCookie(res, refresh);
    res.json({ token: authService.signAccessToken(user), user: privateUser(user) });
});

authRouter.post('/register', REGISTER_LIMITER, async (req, res) => {
    const parsed = REGISTER_BODY.safeParse(req.body);

    if (!parsed.success) return badBody(res, parsed.error);

    try {
        const user = await userService.register(parsed.data);
        const refresh = await authService.issueRefreshToken(String(user._id), req.get('user-agent'));

        setRefreshCookie(res, refresh);
        res.status(201).json({ token: authService.signAccessToken(user), user: privateUser(user) });
    } catch (error) {
        if (isDuplicateKey(error)) {
            // TODO insecure (account enumeration), remove alongside mail pipeline
            res.status(409).json({ error: 'That email is already registered' });

            return;
        }

        throw error;
    }
});

/** Swap the refresh cookie for a new access token (and a rotated cookie). Called on page load. */
authRouter.post('/refresh', REFRESH_LIMITER, requireCsrfHeader, async (req, res) => {
    const presented: unknown = req.cookies?.[REFRESH_COOKIE];

    if (typeof presented !== 'string' || !presented) {
        res.status(401).json({ error: 'Not authenticated' });

        return;
    }

    const result = await authService.rotateRefreshToken(presented, req.get('user-agent'));
    const user = result.ok ? await userService.getById(result.userId) : null;

    if (!result.ok || !user) {
        clearRefreshCookie(res);
        res.status(401).json({ error: 'Not authenticated' });

        return;
    }

    setRefreshCookie(res, result.refresh);
    res.json({ token: authService.signAccessToken(user), user: privateUser(user) });
});

authRouter.post('/logout', requireCsrfHeader, async (req, res) => {
    const presented: unknown = req.cookies?.[REFRESH_COOKIE];

    if (typeof presented === 'string' && presented) {
        await authService.revokeRefreshToken(presented);
    }

    clearRefreshCookie(res);
    res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
    const user = await userService.getById(req.userId!);

    if (!user) {
        res.status(401).json({ error: 'Not authenticated' });

        return;
    }

    res.json(privateUser(user));
});
