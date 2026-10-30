import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import IconButton from '@mui/material/IconButton';
import { NAV_CIRCLE_SIZE } from './navConfig';

/** White circle with a primary-coloured "more" icon. Quick actions menu to come. */
export default function QuickActionsButton() {
    return (
        <IconButton
            aria-label="Quick actions"
            sx={{
                width: NAV_CIRCLE_SIZE,
                height: NAV_CIRCLE_SIZE,
                bgcolor: 'common.white',
                boxShadow: 3, // lifts the white circle off a white page when floating
                '&:hover': { bgcolor: 'grey.100' },
            }}
        >
            <MoreHorizRoundedIcon color="primary" />
        </IconButton>
    );
}
