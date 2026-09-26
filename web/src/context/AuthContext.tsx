import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import * as api from '../lib/api.ts';

type AuthState = {
    token: string | null;
    user: api.AuthUser | null;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
    // In memory on purpose. Refresh the page and you're logged out.
    // localStorage would survive, and so would any XSS that reads it.
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<api.AuthUser | null>(null);

    const value = useMemo<AuthState>(() => ({
        token,
        user,
        async signIn(email: string, password: string) {
            const res = await api.login(email, password);

            setToken(res.token);
            setUser(res.user);
        },
        signOut() {
            setToken(null);
            setUser(null);
        },
    }), [token, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) throw new Error('useAuth must be used inside AuthProvider');

    return context;
}
