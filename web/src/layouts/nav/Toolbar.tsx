import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import MuiToolbar from '@mui/material/Toolbar';
import type { ReactNode } from 'react';
import QuickActionsButton from './QuickActionsButton.tsx';
import UserAvatar from './UserAvatar.tsx';

export default function Toolbar({ children }: { children?: ReactNode }) {
    return (
        <AppBar
            component="header"
            position="sticky"
            color="primary"
            // Below md the bar is transparent so the circles float over the page, and it
            // ignores clicks so content scrolling behind the gaps stays tappable.
            // From md up it's the solid primary bar that hosts the nav tabs.
            sx={{
                pt: 'env(safe-area-inset-top)', // iOS notch clearance
                bgcolor: { xs: 'transparent', md: 'primary.main' },
                boxShadow: { xs: 'none', md: 4 },
                pointerEvents: { xs: 'none', md: 'auto' },
                '& .MuiIconButton-root, & .MuiAvatar-root': { pointerEvents: 'auto' },
            }}
        >
            <MuiToolbar sx={{ gap: 2 }}>
                <QuickActionsButton />
                <Box sx={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'flex-end' }}>
                    {children}
                </Box>
                <UserAvatar />
            </MuiToolbar>
        </AppBar>
    );
}
