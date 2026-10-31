import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, type ApiClient } from '../lib/ApiClient.ts';
import type { AuthUser } from '../lib/apiTypes.ts';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

type AuthState = {
    status: AuthStatus;
    user: AuthUser | null;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    /** The client these calls go through, so features share one session. */
    client: ApiClient;
};

const AuthContext = createContext<AuthState | null>(null);

// Lets a logout in one tab log out the others (their in-memory access token would
// otherwise keep working until it expires).
const CHANNEL_NAME = 'slice-auth';

/** `client` is injectable so tests (or a mock API) can supply an isolated one. */
export function AuthProvider({ children, client = apiClient }: { children: ReactNode; client?: ApiClient }) {
    const [status, setStatus] = useState<AuthStatus>('loading');
    const [user, setUser] = useState<AuthUser | null>(null);

    const clearLocal = useCallback(() => {
        client.setAccessToken(null);
        setUser(null);
        setStatus('anonymous');
    }, [client]);

    // On page load, trade the httpOnly refresh cookie for an access token.
    // This is what keeps you logged in across refreshes.
    useEffect(() => {
        let cancelled = false;

        client.refreshSession()
            .then((session) => {
                if (cancelled) return;
                setUser(session.user);
                setStatus('authenticated');
            })
            .catch(() => {
                if (!cancelled) clearLocal();
            });

        return () => {
            cancelled = true;
        };
    }, [clearLocal, client]);

    useEffect(() => {
        client.setSessionExpiredHandler(clearLocal);

        const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

        if (channel) channel.onmessage = (e) => {
            if (e.data === 'logout') clearLocal();
        };

        return () => {
            client.setSessionExpiredHandler(null);
            channel?.close();
        };
    }, [clearLocal, client]);

    const signIn = useCallback(async (email: string, password: string) => {
        const session = await client.login(email, password);

        setUser(session.user);
        setStatus('authenticated');
    }, [client]);

    const signOut = useCallback(async () => {
        try {
            await client.logout();
        } finally {
            clearLocal();

            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel(CHANNEL_NAME);
                channel.postMessage('logout');
                channel.close();
            }
        }
    }, [clearLocal, client]);

    const value = useMemo<AuthState>(
        () => ({ status, user, signIn, signOut, client }),
        [status, user, signIn, signOut, client],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) throw new Error('useAuth must be used inside AuthProvider');

    return context;
}

/** Features call the API through this, so they get whichever client the provider holds. */
// eslint-disable-next-line react-refresh/only-export-components
export function useApiClient() {
    return useAuth().client;
}
