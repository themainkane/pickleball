import Stack from '@mui/material/Stack';
import type { ReactNode } from 'react';

export function Page({ children }: { children: ReactNode }) {
    return <Stack spacing={2} sx={{ p:{ xs: 2, sm: 3 }}}>{children}</Stack>;
}
