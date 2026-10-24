import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import type { ReactNode } from 'react';

export function CenteredPage({ children }: { children: ReactNode }) {
    return (
        <Stack
            sx={{
                p: { xs: 0, sm: 2 },
                minHeight: "100dvh",
                alignItems: "center",
                justifyContent: "center"}}
        >
            {children}
        </Stack>
    );
}

export function FormCard({ children }: { children: ReactNode }) {
    return (
        <Paper
            elevation={0}
            sx={{
                p: { xs: 2, sm: 4 },
                boxShadow: { xs: 0, sm: 2 },
                width: '100%',
                maxWidth: 400,
            }}
        >
            <Stack spacing={2}>{children}</Stack>
        </Paper>
    );
}
