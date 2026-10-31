import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { Link, useLocation } from 'react-router';
import { getActivePath, NavConfig } from './navConfig';

export default function TopNav() {
    const { pathname } = useLocation();

    return (
        <Box component="nav" aria-label="Main navigation" sx={{ flex: 1, minWidth: 0 }}>
            {/* Selection comes from the URL, so it stays correct on refresh and back/forward. */}
            <Tabs
                value={getActivePath(pathname)}
                textColor="inherit"
                centered
                sx={{ '& .MuiTabs-indicator': { backgroundColor: 'currentColor' } }}
            >
                {NavConfig.map(({ title, path, icon: Icon }) => (
                    <Tab
                        key={path}
                        value={path}
                        label={title}
                        // Theme defaults SvgIcon to primary, which would vanish on the primary bar.
                        icon={<Icon color="inherit" />}
                        iconPosition="start"
                        component={Link}
                        to={path}
                        sx={{ minHeight: 64 }}
                    />
                ))}
            </Tabs>
        </Box>
    );
}
