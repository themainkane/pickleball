import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CenteredPage, FormCard } from '../../ui/FormCard';
import { useAuth } from '../../context/AuthContext';

export function LoginPage() {
    const { signIn } = useAuth();
    const navigate = useNavigate();

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
            navigate('/dashboard', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    }

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
