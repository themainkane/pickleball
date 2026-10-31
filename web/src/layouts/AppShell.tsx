import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import Toolbar from "./nav/Toolbar.tsx";
import BottomNav from "./nav/BottomNav.tsx";
import TopNav from "./nav/TopNav.tsx";

/**
 * All navigation chrome lives here. Feature components never know whether
 * they're on a phone.
 */
export function AppShell({ children }: { children: ReactNode }) {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });

    return (
        <>
            {/* Toolbar is on every screen size; desktop puts the nav tabs inside it. */}
            <Toolbar>{isDesktop && <TopNav />}</Toolbar>
            {children}
            {!isDesktop && <BottomNav />}
        </>
    );
}
