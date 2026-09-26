import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/**
 * All navigation chrome lives here. Feature components never know whether
 * they're on a phone.
 */
export function AppShell({ children }: { children: ReactNode }) {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

    // TODO: BottomNavigation or burger Menu
    void isDesktop;

    return <>{children}</>;
}
