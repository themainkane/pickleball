import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { AppShell } from './AppShell';

export function ProtectedLayout() {
    const { token } = useAuth();

    // Synchronous because the token is in memory — nothing to rehydrate.
    //TODO prevent logout on refresh
    if (!token) return <Navigate to="/login" replace />;

    return <AppShell><Outlet /></AppShell>;
}
