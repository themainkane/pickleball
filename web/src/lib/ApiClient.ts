import { ApiError } from './ApiError.ts';
import type { AuthUser, Session } from './apiTypes.ts';

export type ApiClientOptions = {
    /** Prefix for every request path. Vite proxies /api to the server in dev. */
    baseUrl?: string;
    /** Injectable so tests and server-side rendering can supply their own transport. */
    fetch?: typeof fetch;
    /** Web Lock name. One per client, so two clients on a page don't queue behind each other. */
    refreshLockName?: string;
};

const DEFAULT_BASE_URL = '/api';
const DEFAULT_REFRESH_LOCK = 'pickleball-auth-refresh';

/**
 * Transport for the API, plus the session state that goes with it: the in-memory access
 * token, the in-flight refresh, and the session-expired callback.
 *
 * That state is private to an instance, so `new ApiClient()` always starts clean — no
 * module-level variables leaking between tests or between clients.
 */
export class ApiClient {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly refreshLockName: string;

    /** Deliberately in memory only: localStorage would expose it to XSS. */
    private accessToken: string | null = null;
    private sessionExpiredHandler: (() => void) | null = null;

    /*
     * Refresh tokens are single-use; the server treats a reused one as theft and kills the
     * session. So refreshes must never overlap: one in-flight promise per tab, and a Web
     * Lock across tabs so a second tab waits and then sends the *new* cookie.
     */
    private refreshInFlight: Promise<Session> | null = null;

    constructor({ baseUrl = DEFAULT_BASE_URL, fetch: fetchImpl, refreshLockName = DEFAULT_REFRESH_LOCK }: ApiClientOptions = {}) {
        this.baseUrl = baseUrl;
        // Wrapped rather than `globalThis.fetch` directly: an unbound reference throws
        // "Illegal invocation" in browsers.
        this.fetchImpl = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
        this.refreshLockName = refreshLockName;
    }

    setAccessToken(token: string | null) {
        this.accessToken = token;
    }

    /** AuthContext registers this so a failed refresh mid-session logs the UI out. */
    setSessionExpiredHandler(handler: (() => void) | null) {
        this.sessionExpiredHandler = handler;
    }

    refreshSession(): Promise<Session> {
        this.refreshInFlight ??= this.withCrossTabLock(() => this.rawRequest<Session>('/auth/refresh', { method: 'POST' }))
            .then((session) => {
                this.accessToken = session.token;

                return session;
            })
            .finally(() => {
                this.refreshInFlight = null;
            });

        return this.refreshInFlight;
    }

    async login(email: string, password: string) {
        const session = await this.rawRequest<Session>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });

        this.accessToken = session.token;

        return session;
    }

    async logout() {
        try {
            await this.rawRequest<void>('/auth/logout', { method: 'POST' });
        } finally {
            this.accessToken = null;
        }
    }

    listUsers() {
        return this.authedRequest<{ items: AuthUser[]; hasMore: boolean }>('/users');
    }

    private async rawRequest<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
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

        if (response.status === 204) return undefined as T;

        const body = await response.json().catch(() => null);

        if (!response.ok) {
            throw new ApiError(response.status, body?.error ?? response.statusText, body?.details);
        }

        return body as T;
    }

    /** For authenticated endpoints: on 401, refresh once and retry. */
    private async authedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
        try {
            return await this.rawRequest<T>(path, init, this.accessToken);
        } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 401) throw error;
        }

        try {
            await this.refreshSession();
        } catch (error) {
            this.accessToken = null;
            this.sessionExpiredHandler?.();

            throw error;
        }

        return this.rawRequest<T>(path, init, this.accessToken);
    }

    private withCrossTabLock<T>(work: () => Promise<T>): Promise<T> {
        if (typeof navigator !== 'undefined' && navigator.locks) {
            return navigator.locks.request(this.refreshLockName, work);
        }

        return work();
    }
}

/** The app's client. Tests and alternative transports should construct their own. */
export const apiClient = new ApiClient();
