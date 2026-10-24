import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { listUsers, type AuthUser } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Page } from '../../ui/Page.tsx';

export function Dashboard() {
    const { user, signOut } = useAuth();
    const [users, setUsers] = useState<AuthUser[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listUsers()
            .then((res) => setUsers(res.items))
            .catch((err: Error) => setError(err.message));
    }, []);

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
