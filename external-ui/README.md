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

The UI uses the single backend-managed authorization flow. Sign-in navigates to `GET /rest/auth/oidc/login` (canonical; `GET /ui-api/auth/login` is a deprecated redirect-only alias until `2026-09-30`). The backend stores `state`/`nonce` in signed `HttpOnly` `SameSite=Lax` `Path=/` cookies, completes the sole callback at `GET /rest/auth/oidc/callback` with ID-token verification (signature/issuer/audience/nonce/expiry via `createRemoteJWKSet`/`jwtVerify`, `OIDC_ISSUER` required in every mode, discovered `issuer` must equal `issuerUrl`, `userinfo.sub` bound to `id_token.sub`), and returns a one-time session exchange handle for the SPA to trade at `POST /ui-api/auth/exchange` with JSON body `{"session": "<handle>"}`.

Set these on the backend process at runtime:

| Var                                                     | Default                                  | Description                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER`                                           | `http://localhost:8080/realms/starter`   | Keycloak issuer URL (**required in every mode**; see `validateN8nOidcConfig`/`fetchOidcDiscoveryDocument` — missing issuer fails startup or with `OIDC issuer is required`) |
| `OIDC_CLIENT_ID`                                        | `app`                                    | Public Keycloak client ID                                                                                                                                                   |
| `OIDC_REDIRECT_URI`                                     | `{N8N_BASE_URL}/rest/auth/oidc/callback` | Single OIDC callback URL (sole browser callback)                                                                                                                            |
| `OIDC_SCOPES`                                           | `openid email profile`                   | OIDC scopes                                                                                                                                                                 |
| `UI_AUTH_USE_SEPARATE_TOKEN`                            | `false`                                  | Use app-issued UI token instead of raw upstream access token                                                                                                                |
| `OIDC_PROVIDER_TIMEOUT_MS`                              | `10000`                                  | Bounded provider fetches (`fetchWithTimeout` with `AbortController`, stable `OIDC provider request timed out`)                                                              |
| `UI_AUTH_JWT_SECRET` / `N8N_USER_MANAGEMENT_JWT_SECRET` | —                                        | Secret for app-issued UI JWTs (`createUiAuthToken` HS256, `UI_AUTH_USE_SEPARATE_TOKEN=true` requires `sid`)                                                                 |

## Authentication

Single backend-driven **Authorization Code Flow with PKCE** (`GET /rest/auth/oidc/login` → provider → `GET /rest/auth/oidc/callback`).

Both session artifacts:

- **n8n artifact** — `n8n-auth` cookie (`HttpOnly`, `Secure` when `N8N_BASE_URL` is `https`, `SameSite=Lax`, `Path=/`, 24 h sliding via `getAuthCookieOptions`; JWT 7d inside), issued only for eligible users (`global:owner`/`admin`/`member`). Cookie is linked to UI refresh: `extendN8nAuthCookie` on `X-UI-Auth-Token` refresh, `clearN8nAuthCookie` when UI bearer expired/revoked and a bearer was presented (anonymous without bearer never clears n8n-only session).
- **UI artifact** — one-time exchange handle (`session=...`, 60 s TTL, single-use via `getDel`) appended to the validated `returnTo`; the SPA trades it via `POST /ui-api/auth/exchange` for a bearer token (raw `access_token` or app-issued JWT `HS256` with `sid` bound to `sessionIssueId`) stored in `localStorage["external-ui.auth-token"]` for `Authorization: Bearer ...` to `ui-api`.

Eligibility outcomes:

- **Eligible** → both artifacts, redirect to validated `returnTo` (fallback `/`) with exactly one `session` param.
- **Access-request (ineligible)** → UI artifact only, no n8n user created (new) or disabled preserving role (existing), redirect to `/ui/access-request?session=...`.
- **Failure** (missing/invalid ID token, JWKS, signature/issuer/audience/nonce, userinfo `sub` mismatch, CSTAR verification, Redis/provisioning error) → no artifact, redirect to `/ui?error=<stable message>`.

Exchange handles and `returnTo`/`continue` are validated by `return-target` policy: allowed origins from `N8N_BASE_URL`/`UI_APP_BASE_URL`, `/ui/*` prefixes for login/logout, same-origin local paths for continuation; hostile forms (`//`, `\`, `%5c`, foreign origins, non-http schemes, disallowed paths) fall back to `/ui/` (or `/`) and never receive a handle. Query/fragment preserved with exactly one server-generated param. Upstream credential for CSTAR is resolved from the server-side store/refresh (`session.upstreamAccessToken`/`getUiOidcAccessTokenByEmail`), never by re-reading the UI bearer (app JWT in separate-token mode is not forwarded — AUTH-02).

Logout ownership and revocation:

- UI logout uses authenticated `POST /ui-api/auth/logout-prepare` (verified bearer via `getUiSession`, validates `returnTo` via `resolveReturnTarget` `logout` policy) returning a short-lived single-use `logout` handle (`chwf:ui-oidc:logout:<handle>` 60s) bound to the canonical email + `returnTo`.
- `GET /rest/auth/oidc/logout` trusts only a consumed `logout` handle (`consumeUiLogoutHandle` `getDel`) or a valid `n8n-auth` cookie (`authService.resolveJwt`); `?email=` is ignored, invalid cookie does not fallback. It always clears `n8n-auth` (`authService.clearCookie`), deletes Redis token/tenant/SID records (`deleteUiOidcTokens` **before** discovery so provider failure cannot block revocation), and (if `id_token` + `end_session_endpoint` present) redirects to the provider with `id_token_hint` + `post_logout_redirect_uri=<returnTo with signedOut=1>`. Provider discovery failure still completes local cleanup.
- Server-revocable per-session UI credentials: raw-token mode requires a server-known `acctoken`/`tokenemail` record (`getUiOidcAccessTokenRecord`), separate-JWT mode checks `sid === getUiSessionIssueId(email)`; missing/mismatched is treated as revoked (`null`) without refresh. The SPA always clears `localStorage` and `session`/`continue`/`signedOut`/`logout` markers from history (`clearSecurityParamsFromUrl`/`clearStoredAppToken`).

Callback verification: `state`/`nonce` cookies checked before token exchange (`Missing or invalid nonce`), ID token cryptographically verified via `jwtVerify` with `issuer`/`audience`/`exp`/`nonce` through a reused `createRemoteJWKSet` per `jwks_uri` (AUTH-06, 10s bounded `fetchWithTimeout`), discovered issuer validated exactly (`OIDC discovery issuer mismatch`), `userinfo.sub` required to equal ID-token `sub`; failures fail closed with stable public messages (`toPublicMessage`/`toPublicRouteMessage` allowlist, generic `Authentication failed`) and detailed logs server-side.

Atomic issuance (AUTH-04): `prepareUiSessionExchange` before `createAuthToken`; no failed login leaves a consumable `session` handle or a new usable bearer; partial token writes are best-effort cleaned via `deleteUiOidcTokenRecords` (idempotent) and cannot create a session without `sid`/`tokenemail` + handle; `sid` mutation on failure restores prior `sid` when it existed (re-login preserves prior session) or deletes new `sid` otherwise.

## Routes

| Path       | Page    |
| ---------- | ------- |
| `/`        | Home    |
| `/about`   | About   |
| `/contact` | Contact |
