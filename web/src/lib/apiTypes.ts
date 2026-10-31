// Do not change without changing server/steralizers/user
export type AuthUser = {
    id: string;
    firstName: string;
    lastName: string;
    rating: number | null;
    email: string;
    createdAt: string;
};

export type Session = { token: string; user: AuthUser };
