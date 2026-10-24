import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export function FullPageSpinner() {
    return (
        <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }} role="status" aria-label="Loading">
            <CircularProgress />
        </Box>
    );
}
