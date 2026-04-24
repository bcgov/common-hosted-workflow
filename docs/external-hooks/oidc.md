# OIDC external hook

Custom OIDC authentication for n8n is implemented in `external-hooks/src/oidc.ts`.

This hook adds a full OIDC sign-in flow on top of n8n external hooks, including:

- OIDC discovery or manually configured endpoints.
- Authorization code login flow.
- Just-in-time user provisioning.
- Role sync from OIDC claims.
- Frontend sign-in customization to expose an SSO button.

---

## Source layout

| Path                                     | Role                                                            |
| ---------------------------------------- | --------------------------------------------------------------- |
| `external-hooks/src/oidc.ts`             | Registers OIDC routes, handles callback flow, provisions users. |
| `external-hooks/src/api/utils/logger.ts` | Structured request, response, and error logging helpers.        |

---

## Routes

### 1. Start login

- **URL:** `GET /rest/auth/oidc/login`
- **Behavior:**
- Fetches the OIDC discovery document, unless endpoints are provided directly by environment variables.
- Generates `state` and `nonce` values.
- Stores both values in signed cookies.
- Redirects the browser to the provider authorization endpoint.

### 2. OIDC callback

- **URL:** `GET /rest/auth/oidc/callback`
- **Behavior:**
- Validates `state` and provider errors.
- Exchanges the authorization code for tokens.
- Verifies the `nonce` from the ID token when present.
- Fetches user claims from the `userinfo` endpoint, with fallback to ID token claims.
- Resolves the n8n user by email, creates the user if needed, syncs role, then issues the n8n auth cookie.
- Redirects to `/` on success or back to `/signin?error=...` on failure.

### 3. Frontend helper script

- **URL:** `GET /assets/oidc-frontend-hook.js`
- **Behavior:**
- Injects an SSO button into the sign-in page.
- Hides the normal email/password form by default.
- Allows fallback to the normal form with `?showLogin=true`.

---

## Environment variables

### Required

- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_REDIRECT_URI`

### Discovery mode

- `OIDC_ISSUER_URL`

If `OIDC_ISSUER_URL` is set, the hook resolves provider metadata from:

- `/.well-known/openid-configuration`

### Manual endpoint mode

When `OIDC_ISSUER_URL` is not set, all of the following must be provided:

- `OIDC_AUTHORIZATION_ENDPOINT`
- `OIDC_TOKEN_ENDPOINT`
- `OIDC_USERINFO_ENDPOINT`

### Optional

- `OIDC_SCOPES`
  Default: `openid email profile`

- `OIDC_ROLES_CLAIM`
  Default: `roles`

- `SSO_RESTRICT_NO_ROLE`
  When `true`, users without a mapped OIDC role cannot be newly provisioned, and existing users are synced to an empty role when the token carries no valid role.

---

## Authentication flow

1. User opens `/rest/auth/oidc/login`.
2. The hook creates signed `state` and `nonce` cookies.
3. The browser is redirected to the OIDC provider.
4. The provider returns to `/rest/auth/oidc/callback` with an authorization code.
5. The hook exchanges the code for tokens.
6. The hook loads user claims from `userinfo` or falls back to the ID token.
7. The hook validates `email` and resolves the user in n8n.
8. The hook provisions or updates the user role.
9. The hook signs the n8n auth token using n8n `JwtService` and sets the `n8n-auth` cookie.

---

## User provisioning

The callback uses email as the primary identity key.

- If the user already exists, the hook reuses that account.
- If the user does not exist, the hook creates the user with `User.createUserWithProject(...)` so the personal project is created at the same time.
- A random password is generated for provisioned users. It is not intended for password-based login.

Default role assignment during creation:

- First user in the system: `global:owner`
- Later users: `global:member`
- If a valid OIDC role exists, it overrides the default above.

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
- If `SSO_RESTRICT_NO_ROLE=true`, the next role becomes the mapped OIDC role, or an empty string when the token has no valid role.
- A role change is applied only when the current and next roles differ.

### `SSO_RESTRICT_NO_ROLE` behavior

When `SSO_RESTRICT_NO_ROLE=true`:

- New users are not created if no valid OIDC role is present.
- Existing users are still allowed to authenticate.
- Existing users are synced to an empty role if the token has no valid role.

---

## Last owner protection

The hook prevents OIDC role sync from demoting the last `global:owner` in the system.

Before changing a user from `global:owner` to any other role:

- It counts other users that still have `global:owner`.
- If no other owner exists, the role change is blocked.
- The user is redirected back to sign-in with an error message instead of changing the role.

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
- Callback failures are surfaced to the UI through `/signin?error=...`.
- Logging uses the shared logger helpers from `external-hooks/src/api/utils/logger.ts`.
