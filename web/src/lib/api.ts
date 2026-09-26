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

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init.headers,
        },
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
        throw new ApiError(res.status, body?.error ?? res.statusText, body?.details);
    }

    return body as T;
}

export function login(email: string, password: string) {
    return request<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
}

export function listUsers(token: string) {
    return request<{ items: AuthUser[]; hasMore: boolean }>('/users', {}, token);
}
