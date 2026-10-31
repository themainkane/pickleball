# Agent guide

Read `CONVENTIONS.md` before writing code. It is the authority on style; this file covers layout, commands and gotchas.

## Layout

```
core/          framework-free scheduling engine (+ *.test.ts)
server/src/    Express 5 + Mongoose API
  config/ db/ middleware/ models/ routes/ services/ serializers/ scripts/
web/src/       React 19 + MUI + react-router SPA
  context/ features/ layouts/ lib/ theme/ ui/
server.ts      legacy standalone demo server, not part of the API
```

npm workspaces: `@pickleball/server`, `@pickleball/web`.

## Commands

| Task | Command |
| --- | --- |
| Lint everything (what blocks `git push`) | `npm run lint` |
| Autofix | `npm run lint:fix` |
| Server types | `npm -w @pickleball/server run typecheck` |
| Web types | `cd web && npx tsc -b --noEmit` |
| Core tests | `npm test` |
| Run API (port 4000) | `npm run dev:server` |
| Run web (port 5173, proxies `/api`) | `npm run dev:web` |
| Mongo | `docker compose up -d mongo` |
| Grant superuser | `npm -w @pickleball/server run set-superuser -- EMAIL [--revoke]` |

Two ESLint configs: root `eslint.config.mjs` (ignores `web/**`) and `web/eslint.config.js`. Run `npm run lint` rather than pointing `eslint` at a mixed set of paths.

## Verification

After any change, in order:

1. Type check the package you touched.
2. `npm run lint` — a pre-push hook runs it, so failures block the push.
3. Exercise the change against the running API with `curl`, or a throwaway `tsx` script for non-HTTP paths.
4. Delete throwaway scripts and `web/dist` before reporting.

There is no test framework for `server/` or `web/` yet. Only `core/` has tests (`node:test`). Say so rather than claiming something is tested.

## Comments

- One line where possible. A comment that restates the code is noise — delete it.
- Say *why*. Don't narrate what each line or branch does.
- Never reference the prompt, the request or the conversation: no "as requested", "as discussed", "per instructions", "changed to…".
- Describe the code as it is now, not its history.

Good — earns its place in a few words:

```ts
// CSRF defence
'X-Requested-With': 'fetch',
...(token ? { Authorization: `Bearer ${token}` } : {}),
...init.headers,
```

Bad — three lines paraphrasing five self-evident properties:

```tsx
// Below md the bar is transparent so the circles float over the page, and it
// ignores clicks so content scrolling behind the gaps stays tappable.
// From md up it's the solid primary bar that hosts the nav tabs.
sx={{
    pt: 'env(safe-area-inset-top)', // iOS notch clearance
    bgcolor: { xs: 'transparent', md: 'primary.main' },
    boxShadow: { xs: 'none', md: 4 },
    pointerEvents: { xs: 'none', md: 'auto' },
    '& .MuiIconButton-root, & .MuiAvatar-root': { pointerEvents: 'auto' },
}}
```

## Gotchas

- Mongo must be a replica set for transactions; `docker-compose.yml` sets this up and the healthcheck initiates it.
- The refresh cookie's path is `/api/auth`, so `curl` won't send it to `http://localhost:4000/auth/refresh`. Pass it explicitly.
- Refresh tokens are single-use. Replaying one revokes the whole session family by design.
- Writing files outside the IDE can be clobbered by the editor's buffer. After bulk edits on disk, re-read the file to confirm.
- Smoke tests leave `smoketest-*@example.com` users and test organisations in the dev database. Mention them.

## Safety

- Never commit unless asked. Never force-push, reset hard, or drop collections.
- `server/.env` holds secrets: don't read or echo values.
- Flag any new endpoint that lacks `requireAuth` or a role guard.
