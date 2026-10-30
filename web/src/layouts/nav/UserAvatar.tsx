import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import { deepOrange } from '@mui/material/colors';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext.tsx';
import { NAV_CIRCLE_SIZE } from './navConfig';

function getInitials(firstName = '', lastName = ''): string {
    return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
}

/** User's initials in a circle; links to their profile. */
export default function UserAvatar() {
    const { user } = useAuth();
    const initials = getInitials(user?.firstName, user?.lastName);
    const fullName = user ? `${user.firstName} ${user.lastName}` : 'User';

    return (
        <IconButton component={Link} to="/profile" aria-label="Profile" sx={{ p: 0 }}>
            <Avatar sx={{ bgcolor: deepOrange[500], width: NAV_CIRCLE_SIZE, height: NAV_CIRCLE_SIZE, boxShadow: 3 }} alt={fullName}>
                {initials || undefined}
            </Avatar>
        </IconButton>
    );
}
