import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import type { SvgIconComponent } from '@mui/icons-material';
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded';
import SportsTennisRoundedIcon from '@mui/icons-material/SportsTennisRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';

export const NAV_CIRCLE_SIZE = 40;
enum NavSection {
    Home= 'Home',
    Book= 'Book',
    Plan = 'Plan',
    Match = 'Match',
}
export interface NavItem {
    title: string;
     path: string;
     icon: SvgIconComponent;
}

export const NavConfig: NavItem[] = [
    {
        title: NavSection.Home,
        path: '/',
        icon: HomeRoundedIcon
    },
    {
        title: NavSection.Book,
        path: '/book',
        icon: CalendarMonthRoundedIcon
    },
    {
        title: NavSection.Plan,
        path: '/plan',
        icon: ViewListRoundedIcon
    },
    {
        title: NavSection.Match,
        path: '/match',
        icon: SportsTennisRoundedIcon
    },
]

export function getActivePath(pathname: string): string | false {
    const match = NavConfig.find(({ path }) =>
        path === '/'
            ? pathname === '/'
            : pathname === path || pathname.startsWith(`${path}/`),
    );

    return match?.path ?? false;
}
