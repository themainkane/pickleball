import { createBrowserRouter, Navigate } from 'react-router';
import { LoginPage } from './features/auth/Login';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import {Dashboard} from "./layouts/dashboard/Dashboard.tsx";

export const router = createBrowserRouter([
    { path: '/login', element: <LoginPage /> },
    {
        // Pathless layout route — a gate, not a URL segment.
        element: <ProtectedLayout />,
        children: [
            { path: '/', element: <Navigate to="/dashboard" replace /> },
            { path: '/dashboard', element: <Dashboard /> },
        ],
    },
    { path: '*', element: <Navigate to="/login" replace /> },
]);
