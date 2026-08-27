# OIDC external hook

Custom OIDC authentication for n8n is implemented in `external-hooks/src/api/hooks.ts` and related helpers/routes.

This hook adds a full OIDC sign-in flow on top of n8n external hooks, including:

- OIDC discovery or manually configured endpoints.
- Authorization code login flow.
- Just-in-time user provisioning.
- Role sync from OIDC claims.
- External UI entry into the n8n OIDC login flow.

---

## Source layout

| Path                                                  | Role                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `external-hooks/src/api/hooks.ts`                     | Serves the OIDC frontend assets under `/assets`.                                                                              |
| `external-hooks/src/api/routes/oidc.ts`               | Registers the OIDC login and callback routes.                                                                                 |
| `external-hooks/src/api/helpers/oidc-provider.ts`     | Shared OIDC discovery, PKCE, token exchange, and identity flow.                                                               |
| `external-hooks/src/api/helpers/n8n-oidc.ts`          | n8n-specific OIDC config, cookies, and role helpers.                                                                          |
| `external-hooks/src/api/assets/oidc-frontend-hook.js` | Standalone browser script for n8n login-route redirects and logout interception (mode selected by `OIDC_FRONTEND_HOOK_MODE`). |
| `external-hooks/src/api/utils/logger.ts`              | Structured request, response, and error logging helpers.                                                                      |

---

## Routes

### 1. Start login

- **URL:** `GET /rest/auth/oidc/login`
- **Implementation:** registered in `external-hooks/src/api/routes/oidc.ts`
- **Behavior:**
- If the request already has a valid n8n `n8n-auth` session cookie, redirects directly to `/` without contacting the OIDC provider.
- If the request is unauthenticated, or has a stale or invalid n8n session cookie, starts the OIDC authorization flow.
- Fetches the OIDC discovery document, unless endpoints are provided directly by environment variables.
- Generates `state` and `nonce` values.
- Stores both values in signed cookies.
- Redirects the browser to the provider authorization endpoint.

### 2. OIDC callback

- **URL:** `GET /rest/auth/oidc/callback`
- **Implementation:** registered in `external-hooks/src/api/routes/oidc.ts`
- **Behavior:**
- Validates `state` and provider errors.
- Exchanges the authorization code for tokens.
- Verifies the `nonce` from the ID token when present.
- Fetches user claims from the `userinfo` endpoint, with fallback to ID token claims.
- Resolves the n8n user by email, creates the user if needed, syncs role, then issues the n8n auth cookie.
- Redirects to `/` on success or to `/ui?error=...` on failure.

### 3. External UI entry

- **URL:** `/ui`
- **Behavior:**
- The external UI header exposes a persistent `Open n8n` action regardless of external UI authentication state.
- Activating the action performs full-page navigation to `/rest/auth/oidc/login` using the external UI API base URL configuration.
- A valid n8n session continues directly to `/`; otherwise the OIDC flow starts.

### 4. Frontend helper script

- **URL:** `GET /assets/oidc-frontend-hook.js`
- **Behavior:**
- Single asset whose content is selected server-side by `OIDC_FRONTEND_HOOK_MODE` (default `redirect`):
  - `redirect`: browser navigation to n8n `/login` or `/signin` is replaced with `/ui` so the external UI remains the public login landing page. Logout returns to `/ui`.
  - `legacy`: injects an SSO button into the n8n sign-in form (hides email/password inputs, shows `Sign in with SSO` → `/rest/auth/oidc/login`; escape hatch `?showLogin=true`). Logout returns to `/`.
- Logout clicks in the n8n frontend are intercepted and routed through `/rest/auth/oidc/logout`.
- **Implementation:** single file `external-hooks/src/api/assets/oidc-frontend-hook.js` containing both modes; `external-hooks/src/api/bootstrap/assets.ts` serves it dynamically via placeholder replacement. `Dockerfile` keeps a single `EXTERNAL_FRONTEND_HOOKS_URLS=/assets/oidc-frontend-hook.js` entry.

---

## Environment variables

### Required

- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`

### Discovery mode

- `OIDC_ISSUER`

If `OIDC_ISSUER` is set, the hook resolves provider metadata from:

- `/.well-known/openid-configuration`

### Manual endpoint mode

When `OIDC_ISSUER` is not set, all of the following must be provided:

- `OIDC_AUTHORIZATION_ENDPOINT`
- `OIDC_TOKEN_ENDPOINT`
- `OIDC_USERINFO_ENDPOINT`
- `OIDC_JWKS_URI`

### Optional

- `OIDC_SCOPES`
  Default: `openid email profile`

- `OIDC_ROLES_CLAIM`
  Default: `roles`

- `OIDC_END_SESSION_ENDPOINT`
  When `OIDC_ISSUER` is not set, this provides the IDP logout URL for upstream single-logout. If not set, logout redirects directly without IDP involvement.

- `SSO_RESTRICT_NO_ROLE`
  When `true`, users without a mapped OIDC role are checked for CSTAR managed project roles during sign-in. If they have one, they receive `global:member`. If they do not, new users are not provisioned and existing users are synced to an empty role. If CSTAR verification fails, sign-in fails.

- `OIDC_FRONTEND_HOOK_MODE`
  Controls which browser logic is served at `/assets/oidc-frontend-hook.js`. `redirect` (default) uses the `/ui` redirect mode; `legacy` restores the SSO-button injection mode. Any other value falls back to `redirect`. Set in `Dockerfile` as `OIDC_FRONTEND_HOOK_MODE=redirect` and overridable per environment (docker-compose, Helm).

---

## Authentication flow

1. User opens `/ui` and activates `Open n8n`, which navigates to `/rest/auth/oidc/login`.
2. If the user already has a valid n8n session, the hook redirects to `/`.
3. If the user does not have a valid n8n session, the hook creates signed `state` and `nonce` cookies.
4. The browser is redirected to the OIDC provider.
5. The provider returns to `/rest/auth/oidc/callback` with an authorization code.
6. The hook exchanges the code for tokens.
7. The hook loads user claims from `userinfo` or falls back to the ID token.
8. The hook validates `email` and resolves the user in n8n.
9. The hook provisions or updates the user role.
10. The hook signs the n8n auth token using n8n `JwtService`, sets the `n8n-auth` cookie, and redirects to `/`.

---

## User provisioning

The callback uses email as the primary identity key.

- If the user already exists, the hook reuses that account.
- If the user does not exist, the hook creates the user with `User.createUserWithProject(...)` so the personal project is created at the same time.
- A random password is generated for provisioned users. It is not intended for password-based login.

Default role assignment during creation:

- First user in the system: `global:owner`
- Later users: the resolved next role from OIDC or fallback logic
- If a valid OIDC role exists, it overrides the default above.
- If no valid OIDC role exists, later users may still receive `global:member` from the CSTAR managed project-role fallback or, when `SSO_RESTRICT_NO_ROLE=false`, from the unrestricted default.

---

## Role mapping and sync

The hook reads roles from the configured claim:

- Source claim: `userInfo[OIDC_ROLES_CLAIM]`
- Parsing: comma-separated string
- Accepted values: `global:owner`, `global:admin`, `global:member`
- Only the first valid role is used

Examples:

- `roles: "global:admin"` -> `global:admin`
- `roles: "global:member,other-role"` -> `global:member`
- Missing or unsupported role -> empty role mapping

Role sync behavior:

- If `SSO_RESTRICT_NO_ROLE=false`, the next role becomes the mapped OIDC role, or `global:member` when the token has no valid role.
- If `SSO_RESTRICT_NO_ROLE=true`, the next role becomes the mapped OIDC role, or `global:member` when CSTAR shows a managed project role in any tenant, or an empty string when neither condition is true.
- A role change is applied only when the current and next roles differ.

### `SSO_RESTRICT_NO_ROLE` behavior

When `SSO_RESTRICT_NO_ROLE=true`:

- New users are not created if neither a valid OIDC role nor a qualifying CSTAR managed project role is present.
- Existing users are still allowed to authenticate.
- Existing users are synced to an empty role if neither a valid OIDC role nor a qualifying CSTAR managed project role is present.
- If CSTAR verification fails during the fallback check, sign-in fails instead of silently treating the user as role-less.

---

## Last owner protection

The hook prevents OIDC role sync from demoting the last `global:owner` in the system.

Before changing a user from `global:owner` to any other role:

- It counts other users that still have `global:owner`.
- If no other owner exists, the role change is blocked.
- The user continues signing in without changing the role.

This prevents accidental lockout of the instance through upstream role changes.

---

## Frontend integration

The hook also modifies frontend settings through the `frontend.settings` external hook:

- `frontendSettings.sso.oidc.loginEnabled = true`
- `frontendSettings.sso.oidc.loginUrl = '/rest/auth/oidc/login'`
- `frontendSettings.sso.oidc.callbackUrl = OIDC_REDIRECT_URI`
- `frontendSettings.userManagement.authenticationMethod = 'oidc'`
- `frontendSettings.enterprise.oidc = true`

This makes the frontend treat OIDC as the primary authentication method.

When `OIDC_FRONTEND_HOOK_MODE=redirect` (default) the frontend hook keeps `/ui` as the browser login landing page by replacing initial loads and client-side navigation to `/login` or `/signin` with `/ui`. When `OIDC_FRONTEND_HOOK_MODE=legacy` the hook instead injects the SSO button on `/login`/`/signin` and respects `?showLogin=true`. OIDC start and callback errors are generated server-side and delivered to `/ui?error=...`.

---

## Security notes

- `state` and `nonce` are stored in signed cookies to mitigate CSRF and replay attacks.
- Cookie signing is derived from `N8N_ENCRYPTION_KEY` when available, otherwise falls back to `OIDC_CLIENT_SECRET`.
- The hook validates that the resolved user has a syntactically valid email address before provisioning.
- The hook decodes JWTs for claim extraction but does not implement signature verification itself; token trust relies on the provider token exchange flow.

---

## Operational notes

- If required environment variables are missing, the hook logs a warning and does not register OIDC routes.
- Discovery results are cached in memory for one hour.
- OIDC start and callback failures are surfaced to the external UI through `/ui?error=...`.
- Logging uses the shared logger helpers from `external-hooks/src/api/utils/logger.ts`.
