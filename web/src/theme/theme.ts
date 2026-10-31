import {createTheme, responsiveFontSizes} from '@mui/material/styles';

// Single source of truth for colour, spacing and typography.
// Change things here, not in components.
export const theme = responsiveFontSizes(createTheme({
    palette: {
        mode: 'light',
        primary: { main: '#0a40e3', contrastText: '#f5f5f0' },
    },
    shape: { borderRadius: 10 },
    components: {
        MuiTextField: { defaultProps: { fullWidth: true, margin: 'normal' } },
        MuiButton: {
            defaultProps: { fullWidth: true },
            styleOverrides: { root: { minHeight: 44 } },
        },
        MuiSvgIcon: {defaultProps: { color: 'primary' }},
    },
}));
