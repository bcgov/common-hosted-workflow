# external-ui

Extends the default n8n UI with custom pages and visualizations alongside the main n8n interface.

## Stack

- **React 19** + **TypeScript**
- **Vite** (build tool)
- **Tailwind CSS v4** (styling)
- **react-router v7** (client-side routing)
- **oidc-client-ts** (OIDC PKCE authentication)

## Dev

```sh
pnpm install
pnpm dev
```

Runs on `http://localhost:5173/ui/` with HMR. Requests to `/rest` and `/ui-api` are proxied to `http://localhost:5678` so the SPA can talk to the local n8n backend. Keycloak must be running (`docker compose up keycloak keycloak-provision -d`).

## Build

```sh
pnpm build
```

Output goes to `dist/` with all asset paths prefixed with `/ui/`.

## Production

Built files are served by the `external-hooks` Express app at `/ui` (e.g. `http://localhost:5678/ui/`). React Router uses `basename="/ui"` so client-side routing works under that prefix. Unmatched paths under `/ui/*` fall back to `index.html` for SPA routing.

## Environment Variables (Vite)

Set in `.env.development` or the shell:

| Var                         | Default                                | Description               |
| --------------------------- | -------------------------------------- | ------------------------- |
| `VITE_OIDC_AUTHORITY`       | `http://localhost:8080/realms/starter` | Keycloak issuer URL       |
| `VITE_OIDC_CLIENT_ID`       | `external-ui`                          | Public Keycloak client ID |
| `VITE_OIDC_REDIRECT_URI`    | `{origin}/ui/auth/callback`            | OIDC callback URL         |
| `VITE_OIDC_POST_LOGOUT_URI` | `{origin}/ui/`                         | Post-logout redirect      |
| `VITE_OIDC_SCOPES`          | `openid email profile`                 | OIDC scopes               |

## Authentication

Uses **Authorization Code Flow with PKCE** via `oidc-client-ts`. The SPA's public Keycloak client (`external-ui`) is provisioned automatically by `keycloak-provision`. Login redirects to Keycloak, tokens are stored in session storage, and the user's email is shown in the nav bar when signed in.

## Routes

| Path             | Page                     |
| ---------------- | ------------------------ |
| `/`              | Home                     |
| `/about`         | About                    |
| `/contact`       | Contact                  |
| `/auth/callback` | OIDC callback (internal) |
