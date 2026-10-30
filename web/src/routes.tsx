import { createBrowserRouter, Navigate } from 'react-router';
import { LoginPage } from './features/auth/Login';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import {Dashboard} from "./features/dashboard/Dashboard.tsx";
import { Profile } from './features/profile/Profile.tsx';
import {Book} from "./features/book/Book.tsx";
import {Plan} from "./features/plan/Plan.tsx";
import {Match} from "./features/match/Match.tsx";

export const router = createBrowserRouter([
    { path: '/login', element: <LoginPage /> },
    {
        element: <ProtectedLayout />,
        children: [
            { path: '/', element: <Navigate to="/dashboard" replace /> },
            { path: '/dashboard', element: <Dashboard /> },
            { path: '/profile', element: <Profile /> },
            {path: '/book', element: <Book />},
            {path: '/plan', element: <Plan />},
            {path: '/match', element: <Match />}
        ],
    },
    { path: '*', element: <Navigate to="/login" replace /> },
]);
