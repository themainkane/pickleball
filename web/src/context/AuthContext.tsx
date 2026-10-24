import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '../lib/api.ts';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

type AuthState = {
    status: AuthStatus;
    user: api.AuthUser | null;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Lets a logout in one tab log out the others (their in-memory access token would
// otherwise keep working until it expires).
const CHANNEL_NAME = 'slice-auth';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<AuthStatus>('loading');
    const [user, setUser] = useState<api.AuthUser | null>(null);

    const clearLocal = useCallback(() => {
        api.setAccessToken(null);
        setUser(null);
        setStatus('anonymous');
    }, []);

    // On page load, trade the httpOnly refresh cookie for an access token.
    // This is what keeps you logged in across refreshes.
    useEffect(() => {
        let cancelled = false;

        api.refreshSession()
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
    }, [clearLocal]);

    useEffect(() => {
        api.setSessionExpiredHandler(clearLocal);

        const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

        if (channel) channel.onmessage = (e) => {
            if (e.data === 'logout') clearLocal();
        };

        return () => {
            api.setSessionExpiredHandler(null);
            channel?.close();
        };
    }, [clearLocal]);

    const signIn = useCallback(async (email: string, password: string) => {
        const session = await api.login(email, password);

        setUser(session.user);
        setStatus('authenticated');
    }, []);

    const signOut = useCallback(async () => {
        try {
            await api.logout();
        } finally {
            clearLocal();

            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel(CHANNEL_NAME);
                channel.postMessage('logout');
                channel.close();
            }
        }
    }, [clearLocal]);

    const value = useMemo<AuthState>(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) throw new Error('useAuth must be used inside AuthProvider');

    return context;
}
