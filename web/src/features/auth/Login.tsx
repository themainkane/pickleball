import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CenteredPage, FormCard } from '../../ui/FormCard';
import { useAuth } from '../../context/AuthContext';
import { FullPageSpinner } from '../../ui/FullPageSpinner';

export function LoginPage() {
    const { signIn, status } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setBusy(true);

        try {
            await signIn(email, password);
            navigate(from, { replace: true });
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    }

    if (status === 'loading') return <FullPageSpinner />;
    if (status === 'authenticated' && !busy) return <Navigate to={from} replace />;

    return (
        <CenteredPage>
            <FormCard>
                <Typography variant="h5" component="h1">Sign in</Typography>
                {error && <Alert severity="error">{error}</Alert>}
                <form onSubmit={onSubmit}>
                    <TextField
                        label="Email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <TextField
                        label="Password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <Button type="submit" variant="contained" disabled={busy}>
                        {busy ? 'Signing in…' : 'Sign in'}
                    </Button>
                </form>
            </FormCard>
        </CenteredPage>
    );
}
