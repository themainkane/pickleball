import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useAuth } from '../../context/AuthContext.tsx';
import { Page } from '../../ui/Page.tsx';

export function Profile() {
    const { signOut } = useAuth();

    return (
        <Page>
            <Box>
                <Button onClick={signOut} variant="outlined" fullWidth={false}>
                    Sign out
                </Button>
            </Box>
        </Page>
    );
}
