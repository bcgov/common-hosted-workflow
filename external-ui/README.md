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

Runs on `http://localhost:5173/` with HMR. Requests to `/rest` and `/ui-api` are proxied to `http://127.0.0.1:5678` by default so the SPA can talk to the local n8n backend. Override with `VITE_UI_API_PROXY_TARGET` if needed. Keycloak must be running (`docker compose up keycloak keycloak-provision -d`).

## Build

```sh
pnpm build
```

Output goes to `dist/` with all asset paths prefixed with `/ui/`.

## Production

Built files are served by the `external-hooks` Express app at `/ui` (e.g. `http://localhost:5678/ui/`).

## Backend Auth Config

The UI now uses backend-managed auth. Sign-in redirects to `GET /ui-api/auth/login`, and the backend stores the temporary OIDC state/nonce in Redis before completing the callback and returning a JWT to the browser.

Set these on the backend process at runtime:

| Var                    | Default                                | Description               |
| ---------------------- | -------------------------------------- | ------------------------- |
| `UI_OIDC_ISSUER`       | `http://localhost:8080/realms/starter` | Keycloak issuer URL       |
| `UI_OIDC_CLIENT_ID`    | `app`                                  | Public Keycloak client ID |
| `UI_OIDC_REDIRECT_URI` | `{origin}/ui-api/auth/callback`        | OIDC callback URL         |
| `UI_OIDC_SCOPES`       | `openid email profile`                 | OIDC scopes               |

## Authentication

Uses backend-driven **Authorization Code Flow with PKCE**. The backend mints a JWT for the UI after callback, the SPA stores it locally, and every `ui-api` request sends it as `Authorization: Bearer ...`.

## Routes

| Path       | Page    |
| ---------- | ------- |
| `/`        | Home    |
| `/about`   | About   |
| `/contact` | Contact |
