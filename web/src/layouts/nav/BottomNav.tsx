import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Paper from '@mui/material/Paper';
import { Link, useLocation } from 'react-router';
import { getActivePath, NavConfig } from './navConfig';

export default function BottomNav() {
    const { pathname } = useLocation();

    return (
        <Paper
            component="nav"
            aria-label="Main navigation"
            variant="outlined"
            sx={{
                position: 'fixed',
                left: 16,
                right: 16,
                bottom: 'calc(16px + env(safe-area-inset-bottom))', // iOS home bar clearance
                zIndex: (theme) => theme.zIndex.appBar,
                borderRadius: '9999px', // string: a number would be multiplied by theme.shape.borderRadius
                overflow: 'hidden', // clip tap ripples to the pill
                boxShadow: 3,
            }}
        >
            {/* Selection comes from the URL, so it stays correct on refresh and back/forward. */}
            <BottomNavigation showLabels value={getActivePath(pathname)} sx={{ bgcolor: 'transparent' }}>
                {NavConfig.map(({ title, path, icon: Icon }) => (
                    <BottomNavigationAction
                        key={path}
                        value={path}
                        label={title}
                        icon={<Icon />}
                        component={Link}
                        to={path}
                    />
                ))}
            </BottomNavigation>
        </Paper>
    );
}
