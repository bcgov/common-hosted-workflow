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

Runs on `http://localhost:5173/` with HMR. Requests to `/rest` and `/ui-api` are proxied to `http://127.0.0.1:5678` by default so the SPA can talk to the local n8n backend. Override with `VITE_UI_API_PROXY_TARGET` if needed. Before starting sandbox services, copy `docker-compose/.env.example` to `docker-compose/.env`. Keycloak must be running (`docker compose up keycloak keycloak-provision -d`).

## Build

```sh
pnpm build
```

Output goes to `dist/` with all asset paths prefixed with `/ui/`.

## Production

Built files are served by the `external-hooks` Express app at `/ui` (e.g. `http://localhost:5678/ui/`).

## Backend Auth Config

The UI uses the single backend-managed authorization flow. Sign-in navigates to `GET /rest/auth/oidc/login` (canonical; `GET /ui-api/auth/login` is a deprecated redirect alias). The backend stores `state`/`nonce` in signed `HttpOnly` `SameSite=Lax` `Path=/` cookies, completes the sole callback at `GET /rest/auth/oidc/callback` with ID-token verification (signature/issuer/audience/nonce/expiry via JWKS, `userinfo.sub` bound to `id_token.sub`), and returns a one-time session exchange handle for the SPA to trade at `GET /ui-api/auth/exchange?session=...`.

Set these on the backend process at runtime:

| Var                          | Default                                  | Description                                                  |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `OIDC_ISSUER`                | `http://localhost:8080/realms/starter`   | Keycloak issuer URL                                          |
| `OIDC_CLIENT_ID`             | `app`                                    | Public Keycloak client ID                                    |
| `OIDC_REDIRECT_URI`          | `{N8N_BASE_URL}/rest/auth/oidc/callback` | Single OIDC callback URL (sole browser callback)             |
| `OIDC_SCOPES`                | `openid email profile`                   | OIDC scopes                                                  |
| `UI_AUTH_USE_SEPARATE_TOKEN` | `false`                                  | Use app-issued UI token instead of raw upstream access token |

## Authentication

Single backend-driven **Authorization Code Flow with PKCE** (`GET /rest/auth/oidc/login` → provider → `GET /rest/auth/oidc/callback`).

Both session artifacts:

- **n8n artifact** — `n8n-auth` cookie (`HttpOnly`, `Secure` when `N8N_BASE_URL` is `https`, `SameSite=Lax`, `Path=/`, 24 h), issued only for eligible users (`global:owner`/`admin`/`member`).
- **UI artifact** — one-time exchange handle (`session=...`, 60 s TTL, single-use) appended to the validated `returnTo`; the SPA trades it via `GET /ui-api/auth/exchange` for a bearer token (`access_token` or app-issued JWT with `sid`) stored locally for `Authorization: Bearer ...` to `ui-api`.

Eligibility outcomes:

- **Eligible** → both artifacts, redirect to validated `returnTo` (fallback `/`) with exactly one `session` param.
- **Access-request (ineligible)** → UI artifact only, no n8n user created (new) or disabled preserving role (existing), redirect to `/ui/access-request?session=...`.
- **Failure** (missing/invalid ID token, JWKS, signature/issuer/audience/nonce, userinfo `sub` mismatch, CSTAR verification, Redis/provisioning error) → no artifact, redirect to `/ui?error=<stable message>`.

Exchange handles and `returnTo`/`continue` are validated by `return-target` policy: allowed origins from `N8N_BASE_URL`/`UI_APP_BASE_URL`, `/ui/*` prefixes for login/logout, same-origin local paths for continuation; hostile forms (`//`, `\`, `%5c`, foreign origins, non-http schemes, disallowed paths) fall back to `/ui/` (or `/`) and never receive a handle. Query/fragment preserved with exactly one server-generated param.

Logout ownership and revocation:

- UI logout uses authenticated `POST /ui-api/auth/logout-prepare` (verified bearer, validates `returnTo`) returning a short-lived single-use `logout` handle bound to the canonical email + `returnTo`.
- `GET /rest/auth/oidc/logout` trusts only a consumed `logout` handle or a valid `n8n-auth` cookie; `?email=` is ignored, invalid cookie does not fallback. It always clears `n8n-auth`, deletes Redis token/tenant/SID records (`deleteUiOidcTokens`), and (if `id_token` + `end_session_endpoint` present) redirects to the provider with `id_token_hint` + `post_logout_redirect_uri=<returnTo with signedOut=1>`. Provider discovery failure still completes local cleanup.
- Server-revocable per-session UI credentials: raw-token mode requires a server-known access-token record, separate-JWT mode checks `sid` against stored `sessionIssueId`; missing/mismatched is treated as revoked. The SPA always clears `localStorage` and `session`/`continue`/`signedOut`/`logout` markers from history.

Callback verification: `state`/`nonce` cookies checked before token exchange, ID token cryptographically verified via `jose.jwtVerify` + `createRemoteJWKSet`, discovered issuer validated exactly, `userinfo.sub` required to equal ID-token `sub`; failures fail closed with stable public messages (details in server logs).

## Routes

| Path       | Page    |
| ---------- | ------- |
| `/`        | Home    |
| `/about`   | About   |
| `/contact` | Contact |
