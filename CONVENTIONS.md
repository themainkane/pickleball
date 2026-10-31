# Conventions

Ordered by the file tree. See `AGENTS.md` for commands and workflow.

## Repo-wide

- Full words, no abbreviations: `request`, `response`, `organisationId`, not `req`, `res`, `orgId`.
- British spelling in domain names: `organisation`, `serialize`.
- 4-space indent, single quotes, semicolons, trailing commas in multi-line literals.
- Module-level constants are `SCREAMING_SNAKE_CASE`. Mutable module-level state is banned — put it in a class instance field.
- `PascalCase` files for anything exporting a class or a React component; `camelCase` files for helpers and type-only modules.
- Prefer enums over string unions when the values are referenced in code (`Role`, `ScopeType`). Derive ordering from an explicit map, never from array index.
- Blank line before `return` and around `if` blocks (enforced by `padding-line-between-statements`).
- Unused bindings are prefixed `_`, e.g. `const { passwordHash: _hash, ...safe } = user`.
- Comments say *why*, not *what*. Document non-obvious trade-offs and security reasoning.
- No non-null assertions (`!`) without a clear justification comment.

```ts
// bad — shared mutable state: leaks between tests, impossible to isolate
let accessToken: string | null = null;
const base = '/api';

export function setAccessToken(token: string | null) {
    accessToken = token;
}

// good — state belongs to an instance, constants shout
const DEFAULT_BASE_URL = '/api';

export class ApiClient {
    private accessToken: string | null = null;

    setAccessToken(token: string | null) {
        this.accessToken = token;
    }
}
```

```ts
// bad — rank is positional, so reordering the list silently changes permissions
const ROLES = ['member', 'staff', 'admin', 'owner'] as const;
const rank = (role: Role) => ROLES.indexOf(role);

// good — rank is stated; Record<Role, …> fails to compile if a role has none
export enum RoleRank { Member = 10, Staff = 20, Admin = 30, Owner = 40 }

const RANK_BY_ROLE: Record<Role, RoleRank> = {
    [Role.Member]: RoleRank.Member,
    [Role.Staff]: RoleRank.Staff,
    [Role.Admin]: RoleRank.Admin,
    [Role.Owner]: RoleRank.Owner,
};
```

## `core/`

- Framework-free scheduling engine. No Express, Mongo or React imports.
- One class per file, `PascalCase`, abstract bases named `Base*`.
- Tests are `*.test.ts` beside the source, run with `node:test`.

## `server/src/config/`

- All env access goes through `env.ts`, validated with zod, process exits on a bad env.
- Never read `process.env` elsewhere.

## `server/src/db/`

- Any operation with more than one write uses `withTransaction`. Mongo runs as a single-node replica set for this.
- Work inside a transaction must be retry-safe: no side effects outside the database.

```ts
// bad — a crash between the writes leaves an organisation nobody can administer
const organisation = await this.create(input);
await membershipService.addOwner(ownerUserId, scopeOf(organisation));

// good — both writes commit, or neither does
return withTransaction(async () => {
    const organisation = await this.create(input);

    await membershipService.addOwner(ownerUserId, scopeOf(organisation));

    return organisation;
});
```

## `server/src/middleware/`

- Composable guards: `requireAuth` first, then `requireRole(ScopeType.X, 'xId', Role.Y)` or `requireSuperuser`.
- Permissions are looked up per request. Access tokens carry only `sub`, never roles, so a demotion takes effect immediately.

```ts
// bad — roles baked into the token stay valid until it expires
const token = jwt.sign({ sub: user._id, roles: user.roles }, secret);

// good — guard reads current state on every request
venuesRouter.patch('/:venueId', requireAuth, requireRole(ScopeType.Venue, 'venueId', Role.Admin), handler);
```

## `server/src/models/`

- One schema per `PascalCase` file. Types come from `InferSchemaType`; the plain-object type is `XLean = Lean<X>`.
- Omit `select: false` fields from the read type, so they can't be read where they don't exist (see `UserLean`).
- Declare indexes next to the schema, with a comment naming the query they serve.
- Retire records with `isActive: false` rather than deleting, where history references them.
- Cross-entity links are ids plus an index, never embedded arrays of entities.

```ts
// bad — type claims a hash that select: false keeps out of query results
export type UserLean = Lean<User>;

// good — reads can't touch it; one opt-in type for the credential check
export type UserLean = Omit<Lean<User>, 'passwordHash'>;
export type UserWithPasswordHash = Lean<User>;
```

## `server/src/routes/`

- One router per resource; child routers mount under the parent (`/venues/:venueId/courts`).
- Validate every body and query with a zod schema named `SCREAMING_SNAKE_CASE`; report failures via `badRequest`.
- Child lookups are scoped by the parent id in the URL, so an admin of one parent can't reach another's children.
- Respond with POJOs from `serializers/`. Never return a Mongoose document, a model type, or a raw query result.
- Status codes: 201 create, 204 no body, 400 invalid input, 401 unauthenticated, 403 unauthorised, 404 missing, 409 conflict.

```ts
// bad — leaks __v, passwordHash and ObjectIds, and couples the API to the schema
response.json(await courtService.getById(request.params.courtId));

// good — explicit shape, and scoped to the venue the guard authorised
const court = await courtService.getForVenue(String(request.params.venueId), String(request.params.courtId));

if (!court) {
    response.status(404).json({ error: 'Court not found' });

    return;
}

response.json(publicCourt(court));
```

```ts
// bad — hand-rolled validation and error shape
if (!request.body.name) return response.status(400).json({ error: 'name required' });

// good
const CREATE_COURT_BODY = z.object({ name: z.string().trim().min(1).max(60) });

const parsed = CREATE_COURT_BODY.safeParse(request.body);

if (!parsed.success) return badRequest(response, 'Invalid body', parsed.error);
```

## `server/src/services/`

- One class per `PascalCase` file, extending `BaseService`, with a singleton exported at the bottom (`export const userService = new UserService()`).
- Per-instance state lives in `private` fields.
- Expose narrow `Update*Input` types instead of `Partial<T>`, so a route can't overwrite `createdBy`, `email` or a hash.
- Services own business rules (last-owner checks, ownership, inherited roles). Routes stay thin.
- Return values are plain objects.

```ts
// bad — a route can now move the venue or rewrite who created it
async updateDetails(id: string, patch: Partial<Venue>) {
    return this.updateById(id, patch);
}

// good — only the fields an admin may change
export type UpdateVenueInput = { name?: string; address?: string; timezone?: string };

async updateDetails(id: string, patch: UpdateVenueInput) {
    return this.updateById(id, patch);
}
```

## `server/src/serializers/`

- `publicX` for anyone, `privateX` for the owner, built by spreading `publicX`.
- Map `_id` to a string `id`, absent values to `null`, and omit everything not meant to be public.

```ts
export function publicVenue(venue: SerializableVenue) {
    return {
        id: String(venue._id),
        name: venue.name,
        address: venue.address ?? null,
    };
}

export function privateVenue(venue: SerializableVenue) {
    return { ...publicVenue(venue), createdAt: venue.createdAt };
}
```

## `server/src/scripts/`

- Privileged one-offs (e.g. granting superuser) are CLI scripts, never endpoints.

## `web/src/context/`

- One provider plus a `useX()` hook that throws when used outside it.
- Inject collaborators as props with a default (`client = apiClient`) so tests can pass an isolated one.

```tsx
// bad — hard-wired singleton, untestable in isolation
export function AuthProvider({ children }: { children: ReactNode }) {
    const signIn = useCallback((email: string, password: string) => apiClient.login(email, password), []);

// good — default for the app, override for tests
export function AuthProvider({ children, client = apiClient }: { children: ReactNode; client?: ApiClient }) {
    const signIn = useCallback((email: string, password: string) => client.login(email, password), [client]);
```

## `web/src/features/<feature>/`

- Functional components only, `PascalCase`, named after the file.
- Never define a function that returns JSX inside a component. Extract it to a sibling component in the same file or its own file.
- Data fetching goes through the API client from context, never `fetch` directly.

```tsx
// bad — inner function returning JSX: remounts its subtree on every render
export default function UserAvatar() {
    const { user } = useAuth();

    const renderAvatar = () => <Avatar>{initialsOf(user)}</Avatar>;

    return <div>{renderAvatar()}</div>;
}

// good — a sibling component in the same file
function Initials({ user }: { user: AuthUser | null }) {
    return <Avatar>{initialsOf(user)}</Avatar>;
}

export default function UserAvatar() {
    const { user } = useAuth();

    return <Initials user={user} />;
}
```

## `web/src/layouts/`

- Layout decides the chrome (`AppShell` picks mobile vs desktop). Features never check screen size.
- Navigation items come from `navConfig.ts`; selection is derived from the URL, not local state.

```tsx
// bad — a second source of truth that breaks on refresh and back/forward
const [selected, setSelected] = useState('/');

// good
<BottomNavigation value={getActivePath(pathname)}>
```

## `web/src/theme/`

- Colours, spacing, radius and component defaults live in `theme.ts`. No hard-coded colours in components.
- Use `sx` for one-off layout only; recurring styling becomes a theme default.

```tsx
// bad
<Box sx={{ bgcolor: '#0a40e3', color: '#f5f5f0' }}>

// good — theme tokens, so one change restyles the app
<Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
```

## `web/src/ui/`

- Shared presentational primitives, no feature or domain logic.
