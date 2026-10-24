const BASE = '/api';

export class ApiError extends Error {
    constructor(
        public status: number,
        public message: string,
        public details?: Record<string, string[]>,
    ) {
        super(message);
    }
}

// Do not change without changing server/steralizers/user
export type AuthUser = {
    id: string;
    displayName: string;
    rating: number | null;
    email: string;
    createdAt: string;
};

export type Session = { token: string; user: AuthUser };

let ACCESS_TOKEN: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
    ACCESS_TOKEN = token;
}

/** AuthContext registers this so a failed refresh mid-session logs the UI out. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
    onSessionExpired = handler;
}

async function rawRequest<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            // CSRF defence
            'X-Requested-With': 'fetch',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init.headers,
        },
    });

    if (res.status === 204) return undefined as T;

    const body = await res.json().catch(() => null);

    if (!res.ok) {
        throw new ApiError(res.status, body?.error ?? res.statusText, body?.details);
    }

    return body as T;
}

/*
 * Refresh tokens are single-use; the server treats a reused one as theft and kills the
 * session. So refreshes must never overlap: one in-flight promise per tab, and a Web
 * Lock across tabs so a second tab waits and then sends the *new* cookie.
 */

export function refreshSession(): Promise<Session> {
let refreshInFlight: Promise<Session> | null = null;

    refreshInFlight ??= withCrossTabLock(() => rawRequest<Session>('/auth/refresh', { method: 'POST' }))
        .then((session) => {
            ACCESS_TOKEN = session.token;

            return session;
        })
        .finally(() => {

            refreshInFlight = null;
        });

    return refreshInFlight;
}

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request('pickleball-auth-refresh', fn);
    }

    return fn();
}

/** For authenticated endpoints: on 401, refresh once and retry. */
async function authedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    try {
        return await rawRequest<T>(path, init, ACCESS_TOKEN);
    } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
    }

    try {
        await refreshSession();
    } catch (err) {
        ACCESS_TOKEN = null;
        onSessionExpired?.();
        throw err;
    }

    return rawRequest<T>(path, init, ACCESS_TOKEN);
}

export async function login(email: string, password: string) {
    const session = await rawRequest<Session>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });

    ACCESS_TOKEN = session.token;

    return session;
}

export async function logout() {
    try {
        await rawRequest<void>('/auth/logout', { method: 'POST' });
    } finally {
        ACCESS_TOKEN = null;
    }
}

export function listUsers() {
    return authedRequest<{ items: AuthUser[]; hasMore: boolean }>('/users');
}
