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
            sx={{
                pt: 'env(safe-area-inset-top)', // iOS notch clearance
                bgcolor: { xs: 'transparent', md: 'primary.main' },
                boxShadow: { xs: 'none', md: 4 },
                // Transparent bar must not swallow taps meant for the page behind it.
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
