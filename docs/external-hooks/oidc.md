# OIDC external hook

Custom OIDC authentication for n8n is implemented in `external-hooks/src/api/hooks.ts` and related helpers/routes.

This hook adds a single OIDC authorization flow that establishes an external UI session for every valid OIDC identity and an n8n session only after n8n eligibility succeeds.

---

## Source layout

| Path                                                        | Role                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `external-hooks/src/api/hooks.ts`                           | Serves the OIDC frontend assets under `/assets`.                                                                      |
| `external-hooks/src/api/routes/oidc.ts`                     | Registers the sole OIDC login, callback, and logout routes (`/rest/auth/oidc/*`).                                     |
| `external-hooks/src/api/services/oidc-login-coordinator.ts` | Coordinates provider completion, token persistence, eligibility, provisioning, role sync, and both session artifacts. |
| `external-hooks/src/api/services/post-login-tenant.ts`      | Post-login tenant pre-warm and tenant-project sync for eligible users.                                                |
| `external-hooks/src/api/helpers/oidc-provider.ts`           | OIDC discovery, PKCE, token exchange, ID-token verification, and identity extraction.                                 |
| `external-hooks/src/api/helpers/n8n-oidc.ts`                | n8n-specific OIDC config, cookies, and role helpers.                                                                  |
| `external-hooks/src/api/helpers/cookie.ts`                  | Cookie Secure derivation from `N8N_BASE_URL`/`N8N_PROTOCOL` with production consistency checks.                       |
| `external-hooks/src/api/helpers/return-target.ts`           | Canonical `returnTo` policy shared by login, callback, and logout.                                                    |
| `external-hooks/src/api/assets/oidc-frontend-hook.js`       | Redirect-only browser script for n8n `/login`/`/signin` → `/ui` and logout interception.                              |
| `external-hooks/src/api/utils/logger.ts`                    | Structured request, response, and error logging helpers.                                                              |

---

## Routes

### 1. Start login — `GET /rest/auth/oidc/login`

- If the request already has a valid `n8n-auth` cookie and no validated `returnTo`, redirects to `/` without contacting the provider.
- If a validated `returnTo` (`/ui/*` by policy) is supplied, always starts a fresh authorization even with an existing n8n session so the UI can obtain a new exchange handle.
- Generates `state` and `nonce`, stores them in signed `n8n-oidc-state` / `n8n-oidc-nonce` cookies (`HttpOnly`, `Secure` when `N8N_BASE_URL` is `https`, `SameSite=Lax`, `Path=/`, 15 min), then redirects to the provider `authorization_endpoint` (discovery or manual config).

### 2. Callback — `GET /rest/auth/oidc/callback`

Single browser callback. `GET /ui-api/auth/callback` and UI OIDC state records were removed; only this endpoint completes a new authorization.

Validates `state` and `nonce` cookies before token exchange, exchanges `code` for tokens, then:

- Requires an `id_token` and a usable `jwks_uri`; cryptographically verifies signature via `jose.jwtVerify` with `issuer`, `audience`, `exp`, and `nonce`.
- Validates discovered `issuer` exactly against configured `issuerUrl`.
- Requires `userinfo.sub` to exist and equal the verified ID-token `sub`.
- Merges claims authoritatively: `sub`/`iss`/`aud`/`nonce`/`exp`/`iat` from ID token, `email`/`roles` from ID token if present else verified userinfo, other claims supplement.

On success, the coordinator resolves eligibility and issues sessions (see § Authentication flow). On failure, redirects to `/ui?error=<stable public message>` with no cookies or handles.

### 3. Exchange — `POST /ui-api/auth/exchange`

Consumes a one-time UI exchange handle (see § Exchange handles) via JSON body `{"session": "<handle>"}` (`authExchangeSchema`) and returns the bearer token (`access_token` or app-issued JWT) to the SPA (`{token}` via `authExchangeResponseSchema`). The SPA stores it as `Authorization: Bearer` for `ui-api` calls and clears `session`/`continue` markers from history. Single-use via `getDel` (`consumeUiSessionExchange`); replay → `401`.

### 4. Logout — `GET /rest/auth/oidc/logout`

Canonical logout. Accepts a validated `returnTo` (policy `logout` → `/ui/*`), an optional single-use `logout` handle binding an authenticated UI identity, and a validated `n8n-auth` cookie. See § Logout for ownership and revocation.

Compatibility aliases:

- `GET /ui-api/auth/login?returnTo=...` → 302 to `/rest/auth/oidc/login?returnTo=...`
- `GET /ui-api/auth/logout?returnTo=...` → 302 to `/rest/auth/oidc/logout?returnTo=...`

Aliases are redirect-only, never establish sessions or trust caller-supplied identity, and remain only until next minor (expected 2026-09-30).

### 5. Prepare UI logout — `POST /ui-api/auth/logout-prepare`

Authenticated preparation endpoint. Requires a verified bearer session (`getUiSession` 401 otherwise), validates `returnTo` via `logout` policy (`resolveReturnTarget` `logout` → `/ui/*`), creates an opaque `logout` handle (`chwf:ui-oidc:logout:<handle>` 24 random bytes, 60 s TTL, email normalized `normalizeUiIdentityEmail`) bound to the canonical email + validated `returnTo`, and returns `{ logoutUrl: "/rest/auth/oidc/logout?logout=<handle>" }` (`authLogoutPrepareSchema` `returnTo` ≤2048).

### 6. Frontend helper — `GET /assets/oidc-frontend-hook.js`

Redirect-only. Initial loads and SPA navigation (`pushState`/`replaceState`/`popstate`) to n8n `/login` or `/signin` are replaced with `/ui`. Logout clicks are intercepted and routed through `/rest/auth/oidc/logout?returnTo=/ui`. Served as a static asset with `Cache-Control: public, max-age=3600`; no mode switch, no form injection, no mutation observer.

---

## Environment variables

### Required

- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_ISSUER` — **required in every mode** (`validateN8nOidcConfig` + `fetchOidcDiscoveryDocument` — missing issuer throws `OIDC issuer is required` / `OIDC issuer is required in manual endpoint mode`; `buildOidcRouter` fails fast before serving login; `verifyOidcIdToken` always sets `issuer` in `jwtVerify` so a correctly signed token with an unexpected `iss` is rejected). Configured `issuerUrl` must exactly equal the discovered `issuer` (`OIDC discovery issuer mismatch`).
- `N8N_BASE_URL` — canonical deployment URL (e.g. `https://n8n.example.com`). Determines cookie `Secure` and the sole `OIDC_REDIRECT_URI` (`${N8N_BASE_URL}/rest/auth/oidc/callback`).
- `N8N_PROTOCOL` — must be `https` when `N8N_BASE_URL` is `https` in production. See § Cookie.

### Discovery vs manual endpoints

- `OIDC_ISSUER` is always required. Provider metadata is resolved from `/.well-known/openid-configuration` (`fetchOidcDiscoveryDocument`); `jwks_uri`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, and `end_session_endpoint` are taken from discovery when present.
- If any endpoint is not present in discovery, a manual fallback must be provided: `OIDC_AUTHORIZATION_ENDPOINT`, `OIDC_TOKEN_ENDPOINT`, `OIDC_USERINFO_ENDPOINT`, `OIDC_JWKS_URI`. Manual mode without `OIDC_ISSUER` is not supported (AUTH-03 — issuer-less manual was removed).

### Required secrets and TTLs

- `UI_AUTH_USE_SEPARATE_TOKEN=false` → bearer is the upstream `access_token`; `upstreamAccessToken` is stored server-side and used for CSTAR (`session.upstreamAccessToken` / `getUiOidcAccessTokenByEmail`), never the app JWT (AUTH-02).
- `UI_AUTH_USE_SEPARATE_TOKEN=true` → bearer is an app JWT `HS256` (`createUiAuthToken`/`issueUiSessionToken`). Requires `UI_AUTH_JWT_SECRET` or `N8N_USER_MANAGEMENT_JWT_SECRET`; payload `sid` is required and checked against `sessionIssueId` (single slot per email, 30d). TTL `min(8h, upstream expires_in)` (`UI_AUTH_JWT_TTL_MS` 8h); separate tokens fully expired (`isSeparateTokenExpired`) are rejected without refresh, within 5 min window (`shouldRefreshSeparateToken`/`UI_AUTH_REFRESH_WINDOW_MS` 5m) they attempt `refreshOidcTokens`.
- TTLs: `n8n-auth` cookie 24h sliding (`getAuthCookieOptions`), JWT inside 7d; `n8n-oidc-state/nonce` 15m; `session`/`logout` handles 60s each; `refresh_token` cap 30d (`REFRESH_TOKEN_MAX_TTL_MS`); `id_token` `exp-now` or 24h; `acctoken` reverse `max(exp-now+5m,5m)`; `tenantRoles/Groups` 1h; discovery 1h.

### Optional

- `OIDC_SCOPES` — default `openid email profile`
- `OIDC_ROLES_CLAIM` — default `roles`
- `OIDC_END_SESSION_ENDPOINT` — IDP logout URL when not in discovery; if absent, logout completes locally.
- `SSO_RESTRICT_NO_ROLE` — see § Role mapping.
- `UI_AUTH_USE_SEPARATE_TOKEN` — `true` issues an app-signed JWT for UI bearer auth; `false` returns the upstream `access_token` directly.
- `UI_AUTH_JWT_SECRET` / `N8N_USER_MANAGEMENT_JWT_SECRET` — secret for app-issued UI JWTs.
- `OIDC_PROVIDER_TIMEOUT_MS` — default `10000` ms; all provider fetches (`fetchOidcDiscoveryDocument`, `exchangeAuthorizationCode`, `refreshOidcTokens`, `fetchOidcUserInfo`) use `fetchWithTimeout` with `AbortController` (`OIDC provider request timed out`), tested with bounded timeout.
- `UI_APP_BASE_URL` — default `${N8N_BASE_URL}/ui`; first absolute base determines `trustedBase` for `returnTo` policy.
- `CSTAR_BASE_URL`, `FEATURES_ENABLED`, `UI_OIDC_REDIS_URL/PASSWORD/PREFIX` — see canonical summary `docs/platform/user-authn-authz-summary.md:3`.

---

## Single authorization flow and both session artifacts

There is one browser authorization flow: `GET /rest/auth/oidc/login` → provider → `GET /rest/auth/oidc/callback`.

Callback outcomes:

| Outcome                                                                                                                                                                    | n8n artifact                                                                                                                                                                                                                                                                                           | UI artifact                                                                                                                                                                                                   | Redirect                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Eligible** — `nextRole` is `global:owner`/`admin`/`member`                                                                                                               | `n8n-auth` cookie (`HttpOnly`, `Secure` when `https`, `SameSite=Lax`, `Path=/`, 24 h sliding / JWT 7d) set **after** `prepareUiSessionExchange` (see Atomic issuance)                                                                                                                                  | One-time exchange handle (`chwf:ui-oidc:session:<handle>` 60s, `getDel` single-use) appended as `?session=<handle>` to validated `returnTo` (fallback `/?continue=/`), traded at `POST /ui-api/auth/exchange` | Validated `returnTo` with exactly one `session` param, preserving query/fragment                                                                     |
| **Access-request** — `nextRole` empty (ineligible) — AUTH-01                                                                                                               | None (no user created if new; existing ineligible user disabled, preserving stored role) **plus `Set-Cookie: clear n8n-auth` on the callback response** (`authService.clearCookie`, fallback `res.clearCookie`) so any prior `n8n-auth` (same or cross-identity) is terminated at this shared boundary | One-time exchange handle → `POST /ui-api/auth/exchange` yields UI bearer (`canRequestAccess` only)                                                                                                            | `/ui/access-request?session=<handle>` with `Set-Cookie: clear n8n-auth`                                                                              |
| **Failure** — missing `id_token`/`jwks_uri`, signature/issuer/audience/nonce/expiry/userinfo `sub` mismatch, CSTAR verification error, Redis failure, provisioning failure | None                                                                                                                                                                                                                                                                                                   | None (any handle already created is deleted via `consumeUiSessionExchange`/`deleteUiSessionExchange` idempotent; `sid` restored or deleted per prior existence — AUTH-04)                                     | `/ui?error=<stable public message>` (no handle, no cookie; allowlist generic `Authentication failed`, issuer→`Invalid issuer`; see § Security notes) |

Valid OIDC identities always receive an external UI session; only eligible identities receive `n8n-auth` and n8n-derived UI capabilities (`global:*` and `project:*` via `computePermissions`). Ineligible/disabled identities receive `canRequestAccess` only.

UI exchange handles are separate from the `n8n-auth` cookie. The SPA trades the handle once for a bearer token; bearer tokens are either the upstream `access_token` or an app-issued JWT (`sid` bound to `sessionIssueId`, 8 h max, refresh window 5 min before expiry; fully expired `isSeparateTokenExpired` tokens are rejected without refresh; raw mode uses `shouldRefreshAccessToken` at/after `expiresAt`).

**Atomic issuance guarantee (AUTH-04, `oidc-login-coordinator.test.ts`):** No failed login leaves a consumable `session` handle or a new usable bearer; partial `reftoken/idtoken/acctoken` writes are best-effort cleaned via `deleteUiOidcTokenRecords` (idempotent, original error preserved) and cannot create a session without a valid `sid` (separate) or `tokenemail`+handle (raw), nor defeat logout (`deleteUiOidcTokens` deletes all).

---

## Eligibility, provisioning, and role sync

Email is the identity key.

- **Existing user found** → reuse.
- **New user + `nextRole` empty** → no n8n user created; UI-only access-request.
- **New user + `nextRole` present** → `createUserWithProject`; first user in system becomes `global:owner` regardless of `nextRole`, later users receive `nextRole`.
- **Existing user** → `syncN8nUserRole` with last-owner protection; existing ineligible user is disabled (`user.disabled = true`, role preserved, not synced to empty string); eligible previously-disabled user is re-enabled; then tenant mapping ensured and post-login work scheduled.

`nextRole` resolution is shared for new and existing users (see § Role mapping).

Post-login work (eligible only, non-blocking): `prewarmTenantRolesAndGroups` + `syncTenantsForUser` concurrently via `Promise.allSettled`; missing `access_token` or unconfigured CSTAR skips. Logged but never fails login.

---

## Role mapping and sync

The hook reads roles from `claims[OIDC_ROLES_CLAIM]`:

- Parsing: comma-separated string, trimmed.
- Accepted values: `global:owner`, `global:admin`, `global:member`
- **First valid role wins** — the first element (left to right) that equals one of the three accepted slugs is used; if none matches, the mapping is empty.

Examples:

- `roles: "global:admin"` → `global:admin`
- `roles: "other-role,global:member"` → `global:member` (first valid)
- `roles: "global:member,other-role"` → `global:member`
- `roles: "other-role"` or missing → empty

Role sync behavior:

- If `SSO_RESTRICT_NO_ROLE=false`, `nextRole` is the mapped OIDC role or `global:member` when no valid role.
- If `SSO_RESTRICT_NO_ROLE=true`, `nextRole` is the mapped OIDC role, or `global:member` when CSTAR shows a managed project role (`project:editor`/`viewer`/`admin`) in any tenant, or empty when neither.

A role change is applied only when `currentRole !== nextRole`.

### `SSO_RESTRICT_NO_ROLE` behavior

When `true`:

- New users are not created if neither a valid OIDC role nor a qualifying CSTAR managed project role is present (access-request).
- Existing ineligible users are disabled (preserving stored `role.slug`, not cleared) and receive UI-only session.
- Previously disabled users who become eligible are re-enabled.
- If CSTAR verification fails during the fallback check, sign-in fails with `Unable to verify CSTAR tenant roles during sign-in` instead of silently treating the user as role-less.

---

## Last owner protection

Before changing `global:owner` → any other role, the hook counts other `global:owner` users. If none, the change is blocked and the user continues signing in without changing the role. Existing disabled owners retain their DB role but `computePermissions` and `checkRole` deny all n8n-derived capabilities.

---

## Exchange handles

- Opaque handles: `crypto.randomBytes(24).base64url`, Redis key `session:<handle>`, TTL 60 s, `getDel` single-use.
- Created for both eligible and access-request logins; deleted if `createAuthToken` fails.
- Appended via `appendSessionToReturnTo` (`URL.searchParams.set('session', handle)`) guaranteeing exactly one `session` param and preserving query/fragment; never appended to a rejected `returnTo` fallback.

---

## Logout ownership and revocation

Logout identity is trusted only from:

1. A consumed `?logout=<handle>` record (created by authenticated `POST /ui-api/auth/logout-prepare`), or
2. A valid `n8n-auth` cookie resolved via `authService.resolveJwt`.

Caller-supplied `?email=` is ignored; invalid `n8n-auth` does not fallback to caller identity.

On logout:

- `authService.invalidateToken` + `clearCookie` always runs (clears `n8n-auth` on every path).
- `deleteUiOidcTokens(email)` deletes `reftoken`, `idtoken`, `acctoken` (+ reverse lookup), `sessionIssueId`, `tenantroles`, `tenantgroups`.
- Server-side UI revocation: raw-token mode requires a server-known `acctoken` record (`getUiOidcAccessTokenRecord` missing → revoked); separate-JWT mode verifies `sid` against stored `sessionIssueId` (`null`/mismatch → revoked). Missing `id_token` or `end_session_endpoint` skips upstream.
- Otherwise redirects to upstream `end_session_endpoint` with `id_token_hint` + `post_logout_redirect_uri=<validated returnTo with signedOut=1>`.
- Provider discovery failure still completes local cleanup then redirects locally.
- Logout handles are short-lived (60 s), single-use via `getDel`, and bound to the validated `returnTo` from preparation.

---

## Redirect policy

Every browser return target (`returnTo` on login/callback/logout, `continue` in SPA) is resolved through `resolveReturnTarget(purpose, policy)`:

- Policy injected from `N8N_BASE_URL`/`UI_APP_BASE_URL` at router creation: `trustedBase` is the first absolute base, `allowedOrigins` are the origins of absolute bases + trusted base, path prefixes are `/ui/*` for login/logout and `/` for continuation.
- Rejects: `//` authority-relative, backslashes / encoded `%5c`, control characters, credentials, non-`http(s)` schemes, foreign origins, disallowed same-origin paths, encoded dot-segment escapes; canonicalizes `..`/`.` and decodes pathname before prefix check.
- Rejected candidates fall back to `buildUiAppUrl('/')` (or `/ui/` for logout) and never receive a session handle or `signedOut` marker off-policy.
- Query strings and fragments are preserved; server-added `session`/`signedOut`/`continue` use `URL.searchParams.set` for exactly one occurrence.
- Browser `continue` destinations are validated against `location.origin` and must remain same-origin local paths.

---

## Callback verification

- `state`/`nonce` signed cookies validated before token exchange (`Missing or invalid nonce - session expired` on failure via `verifySignedCookie`/`validateCallbackRequest`).
- Missing `id_token` or `jwks_uri` → `Missing ID token` / `OIDC JWKS URI is not configured`.
- `OIDC_ISSUER` is mandatory; `fetchOidcDiscoveryDocument` throws `OIDC issuer is required in manual endpoint mode` if empty; `buildOidcRouter` throws before serving login if not configured.
- `jose.jwtVerify` with `issuer` (always set), `audience`, `exp`, `nonce` via a reused `createRemoteJWKSet(jwks_uri)` per URI (`jwksCache`, AUTH-06, `clearJwksCacheForTests`); discovered `issuer` must equal configured `issuerUrl` exactly (`OIDC discovery issuer mismatch`).
- `userinfo.sub` must exist and equal verified `id_token` `sub`; otherwise `userinfo sub mismatch`.
- Signed-cookie HMAC uses `crypto.timingSafeEqual` after equal-length check.
- Provider fetches are bounded via `fetchWithTimeout` (`AbortController` + `OIDC_PROVIDER_TIMEOUT_MS` default 10s, `OIDC provider request timed out`).

---

## Cookie

`n8n-oidc-state`, `n8n-oidc-nonce` (15 min), and `n8n-auth` (24 h) are set with `HttpOnly: true`, `SameSite: Lax`, `Path: /`, and `Secure` derived via `getSecureCookieFlag()`:

- Parses `N8N_BASE_URL` protocol; if `https` then `Secure=true` else `false`.
- In production (`NODE_ENV=production`), an `https` base with `N8N_PROTOCOL` not `https`, or an `http` base with `N8N_PROTOCOL=https`, or a missing/invalid base without `N8N_PROTOCOL=https`, throws at startup (no silent non-Secure production cookie).
- In non-production, base protocol wins when parseable, otherwise `N8N_PROTOCOL === 'https'`.
- Helm (`helm/main/values.yaml`) and `Dockerfile` set `N8N_PROTOCOL=https` matching `N8N_BASE_URL` `https`; `docker-compose` uses `http` for both.
- `n8n-auth` is linked to the OIDC refresh lifecycle: `GET /ui-api/session` and `requireUiRequestContext` (`routes/ui-api.ts:38`) via `createUiRequestContextMiddleware` (`100`) — when `getUiSession` succeeds with `refreshedToken` and `n8n-auth` is present, the cookie is re-issued (`res.cookie('n8n-auth', sameToken, getAuthCookieOptions(isSecure))` sliding 24 h `helpers/cookie.ts:66`); when `getUiSession` returns `null` with a bearer present (OIDC expired, `isRefreshTokenExpired` `helpers/ui-auth-token.ts:30` or revoked `sid`/`acctoken` missing), `n8n-auth` is cleared (`res.clearCookie('n8n-auth', {httpOnly,secure,sameSite:lax,path:'/'})` `48`) so both sessions end together. Anonymous without a bearer never clears n8n-only session.

State cookie also carries `returnTo`, `codeVerifier`, and `redirectUri`; nonce cookie carries `nonce`.

---

## Frontend integration

Frontend settings via `frontend.settings` external hook:

- `frontendSettings.sso.oidc.loginEnabled = true`
- `frontendSettings.sso.oidc.loginUrl = '/rest/auth/oidc/login'`
- `frontendSettings.sso.oidc.callbackUrl = OIDC_REDIRECT_URI` (`${N8N_BASE_URL}/rest/auth/oidc/callback`)
- `frontendSettings.userManagement.authenticationMethod = 'oidc'`
- `frontendSettings.enterprise.oidc = true`

The frontend hook keeps `/ui` as the browser login landing page by replacing initial loads and client-side navigation to `/login` or `/signin` with `/ui`. OIDC start and callback errors are delivered to `/ui?error=...` with stable public messages (details in server logs).

---

## Security notes

- `state`/`nonce` in signed cookies mitigate CSRF/replay; signatures compared with `timingSafeEqual`.
- ID token is cryptographically verified (signature, issuer — always required — audience, expiry, nonce) via a reused JWKS resolver per `jwks_uri`; `userinfo` is bound to the same subject.
- Cookie signing key derived from `N8N_ENCRYPTION_KEY` (or `OIDC_CLIENT_SECRET` fallback) via SHA-256 with `-oidc-state` suffix.
- Valid email required before provisioning.
- Public error boundaries (AUTH-03, `oidc.test.ts`/`oidc-provider.test.ts`): `ALLOWED_OIDC_PROVIDER_ERROR_CODES` allowlist (19 codes) and `STABLE_PUBLIC_ROUTE_MESSAGES` allowlist map provider/route errors to stable public codes/messages; unknown or hostile texts (e.g. `<script>`, `redis://`, raw infrastructure) are mapped to generic `Authentication failed` (or issuer mismatch → `Invalid issuer`) and detailed causes are logged server-side via `logError`; no raw provider text is placed in `?error=` redirects.
- Token refresh TTLs: refresh token capped to `min(provider remaining, 30d)` (`setUiOidcRefreshTokenWithExpiry`); `UI` bearer 8 h max with 5-min refresh window (`UI_AUTH_REFRESH_WINDOW_MS`); fully expired separate tokens (`isSeparateTokenExpired`) rejected without refresh, raw `shouldRefreshAccessToken` at/after `expiresAt`; `n8n-auth` 24 h cookie slides on UI refresh (`extendN8nAuthCookie` when `X-UI-Auth-Token` present) and is cleared when OIDC session expires/revoked **and a bearer was presented** (`clearN8nAuthCookie` / `shouldClearN8nCookieOnExpiry`; anonymous without bearer never clears n8n-only session) linked via `createUiRequestContextMiddleware`.
- `n8n-auth` and UI bearer are not interchangeable: UI bearer never authenticates `GET /rest/auth/oidc/*` (those use cookie or handle), `n8n-auth` never authenticates `/ui-api/*` (those use `Authorization: Bearer` via `requireUiRequestContextMiddleware`).
- Upstream CSTAR calls use the server-side upstream token (`session.upstreamAccessToken` resolved via `getUiOidcAccessTokenByEmail` or `refreshAccessToken` closure), never the presented UI bearer in separate-token mode (AUTH-02, `ui-api.test.ts` separate-token regression).
- Race safety (AUTH-05, `ui-oidc-store-refresh.test.ts`): `setUiOidcAccessTokenRecord` uses Lua CAS (`SET_ACCESS_TOKEN_LUA`) and per-email in-process lock; `deleteUiOidcTokens` uses verify-after-DEL + orphan sweep; `refreshSessionByEmail` uses single-flight per normalized email (`REFRESH_SINGLE_FLIGHT_TIMEOUT_MS` 10s).

---

## Operational notes

- Required env missing or `OIDC_ISSUER` absent → routes not registered, warning logged; `buildOidcRouter` throws `OIDC issuer is required` so an invalid security configuration fails before serving login (AUTH-03).
- Discovery cached in memory for 1 h (`fetchOidcDiscoveryDocument`); JWKS resolvers reused per `jwks_uri` while preserving `jose` key rotation on `kid` miss.
- Provider fetches bounded by `OIDC_PROVIDER_TIMEOUT_MS` (default 10s) via `fetchWithTimeout`.
- `GET /ui-api/auth/login` and `GET /ui-api/auth/logout` aliases are redirect-only (302) until `2026-09-30`; they do not establish sessions or trust caller identity (canonical is `GET /rest/auth/oidc/*`).
- OIDC failures surfaced via `/ui?error=...` with allowlisted stable public messages (browser) and `logError` (server); `?email=` on logout is untrusted.
- Logging via `external-hooks/src/api/utils/logger.ts`; `Open n8n` affordance is hidden for anonymous/loading/disabled/role-less users (defense-in-depth, server-side `n8n-auth` remains authoritative — AUTH-08).
