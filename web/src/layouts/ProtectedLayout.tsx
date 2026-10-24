import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { FullPageSpinner } from '../ui/FullPageSpinner';
import { AppShell } from './AppShell';

export function ProtectedLayout() {
    const { status } = useAuth();
    const location = useLocation();

    // Session is being restored from the refresh cookie; don't redirect yet.
    if (status === 'loading') return <FullPageSpinner />;

    if (status === 'anonymous') {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    return <AppShell><Outlet /></AppShell>;
}
