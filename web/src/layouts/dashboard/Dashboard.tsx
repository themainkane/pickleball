import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { listUsers, type AuthUser } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Page } from '../../ui/Page';

export function Dashboard() {
    const { token, user, signOut } = useAuth();
    const [users, setUsers] = useState<AuthUser[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;

        listUsers(token)
            .then((res) => setUsers(res.items))
            .catch((err: Error) => setError(err.message));
    }, [token]);

    return (
        <Page>
            <Typography variant="h4">Hello {user?.displayName}</Typography>
            <Button onClick={signOut} variant="outlined">Sign out</Button>

            {error && <Typography color="error">{error}</Typography>}

            {users.map((u) => (
                <Typography key={u.id}>{u.displayName} — {u.rating ?? 'unrated'}</Typography>
            ))}
        </Page>
    );
}
