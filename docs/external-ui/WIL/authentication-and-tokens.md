# Authentication & Tokens

This document covers the authentication flows, token types, and user context passing in the WIL system.

## Token Types Overview

| Token            | Purpose                             | Lifetime              | Storage           | Exposed to Browser?       |
| ---------------- | ----------------------------------- | --------------------- | ----------------- | ------------------------- |
| App Bearer JWT   | Authenticate UI API requests        | Session-based         | localStorage      | Yes                       |
| OIDC Session     | Server-side identity context        | Session-based         | Backend session   | Claims only (via /whoami) |
| CHEFS Auth Token | Authorize form rendering/submission | Short-lived (minutes) | React state       | Yes (scoped to one form)  |
| FormAPIKey       | Exchange for CHEFS Auth Token       | Long-lived            | DB action payload | **Never**                 |
| Callback URL     | Target for interaction responses    | Permanent             | DB action record  | **Never**                 |

## Authentication Flow

### 1. App Authentication (Frontend → Backend)

The external-ui stores an app token in localStorage under `external-ui.auth-token`. An axios interceptor attaches it to every request:

```typescript
// services/backend/axios.ts
instance.interceptors.request.use((config) => {
  const token = getStoredAppToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});
```

The backend's `requireUiRequestContext` middleware validates this JWT and attaches the OIDC session to the request object.

### 2. Tenant Scoping

Every WIL request includes an `X-TENANT-ID` header (UUID). The backend:

1. Validates UUID format
2. Queries `tenant_project_relation` table → resolves to project IDs
3. Scopes all DB queries to those project IDs

```typescript
// Simplified flow in resolveWilTenantProjectIds
const tenantId = req.header('x-tenant-id');
// Validate UUID format
const projectIds = await tenantProjectRelationRepo.getProjectIdsByTenantId(tenantId);
// All subsequent queries use: WHERE projectId IN (projectIds)
```

### 3. Actor Resolution

The authenticated session provides two identifiers:

- **Primary:** `session.email` — the user's email address
- **Fallback:** `session.subject` — the OIDC subject ID (sub claim)

Actions are queried first by email. If no results, the system retries with the subject. This dual-lookup handles cases where actions were created with either identifier.

```typescript
// resolveActorIds
return {
  primary: session.email, // e.g., "user@gov.bc.ca"
  fallback: session.subject, // e.g., "a1b2c3d4-..."
};
```

## CHEFS Token Exchange

This is the most complex authentication flow — it securely authorizes the browser to render and submit a CHEFS form without ever exposing the FormAPIKey.

### Flow Diagram

```
Browser                          Backend                         CHEFS Gateway
  │                                │                                │
  │ POST /ui-api/wil/chefs-token   │                                │
  │ { actionId }                   │                                │
  │ + Authorization: Bearer <app>  │                                │
  │ + X-TENANT-ID: <uuid>         │                                │
  │──────────────────────────────▶│                                │
  │                                │                                │
  │                                │ 1. Validate session            │
  │                                │ 2. Resolve tenant → projects   │
  │                                │ 3. Fetch action record         │
  │                                │ 4. Verify actionType=showform  │
  │                                │ 5. Extract formApiKey, formId  │
  │                                │                                │
  │                                │ POST /auth/token/forms/{formId}│
  │                                │ Authorization: Basic           │
  │                                │   base64(formId:formApiKey)    │
  │                                │───────────────────────────────▶│
  │                                │                                │
  │                                │◀──── { token: "jwt..." } ─────│
  │                                │                                │
  │◀─── { authToken, formId,      │                                │
  │       formName, baseUrl }      │                                │
  │                                │                                │
```

### Backend Implementation

```typescript
// ChefsService.getFormToken()
const tokenUrl = `${this.gatewayUrl}/auth/token/forms/${formId}`;
const credentials = Buffer.from(`${formId}:${formApiKey}`).toString('base64');

const tokenResponse = await fetch(tokenUrl, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
  },
});

const tokenData = await tokenResponse.json(); // { token: "..." }
return {
  authToken: tokenData.token,
  formId,
  baseUrl: this.baseUrl, // e.g., "https://submit.digital.gov.bc.ca/app"
};
```

### Environment Configuration

| Variable            | Default                                           | Description                               |
| ------------------- | ------------------------------------------------- | ----------------------------------------- |
| `CHEFS_GATEWAY_URL` | `https://submit.digital.gov.bc.ca/app/gateway/v1` | CHEFS gateway endpoint for token exchange |

The `baseUrl` returned to the frontend is derived by stripping the `/gateway/v1` suffix from `CHEFS_GATEWAY_URL`. This is the URL the `<chefs-form-viewer>` web component uses to load form definitions.

## User Context Passing to CHEFS

When the ShowForm handler initializes, it makes two parallel requests:

1. `POST /ui-api/wil/chefs-token` → gets `authToken`, `formId`, `baseUrl`
2. `GET /ui-api/whoami` → gets OIDC claims

The OIDC claims are then mapped into three objects that the `<chefs-form-viewer>` web component uses:

### Token Object

Passed as the `token` attribute. Represents the authentication context for form logic/rules.

```typescript
function buildTokenObject(claims: Record<string, unknown>) {
  return {
    sub: claims.sub,
    roles: claims.client_roles ?? [],
    email: claims.email,
    idp: claims.identity_provider,
  };
}
```

### User Object

Passed as the `user` attribute. Provides display-friendly user info to the form.

```typescript
function buildUserObject(claims: Record<string, unknown>) {
  return {
    name: claims.display_name,
    firstName: claims.given_name,
    lastName: claims.family_name,
    email: claims.email,
    username: claims.idir_username ?? claims.preferred_username,
    idp: claims.identity_provider,
  };
}
```

### User Profile (Prefill Data)

Merged into `prefillData` alongside any `formPreFillData` from the action payload. Allows form fields to auto-populate with user identity information.

```typescript
function buildUserProfile(claims: Record<string, unknown>) {
  return {
    idpUserId: claims.idir_user_guid,
    username: claims.idir_username,
    firstName: claims.given_name,
    lastName: claims.family_name,
    fullName: claims.display_name,
    email: claims.email,
    idp: claims.identity_provider,
  };
}

// Merged as:
const prefillData = {
  ...formPreFillData, // from action payload (workflow-defined)
  ...userProfile, // from OIDC claims (auto-populated)
};
```

### Headers Object

The app's Bearer token is passed as a custom header to the CHEFS web component, enabling CHEFS to make authenticated requests on behalf of the user if needed.

```typescript
const userToken = getStoredAppToken();
const headers = userToken ? { Authorization: `Bearer ${userToken}` } : {};
```

## Security Considerations

### FormAPIKey Never Leaves the Server

The `mapActionToUiResponse` function explicitly strips any key whose lowercase form matches `formapikey` from the action payload before sending it to the browser:

```typescript
if (action.actionType === 'showform') {
  for (const key of Object.keys(payload)) {
    if (key.toLowerCase() === 'formapikey') {
      delete payload[key];
    }
  }
}
```

This ensures even if the GET `/actions` endpoint is called directly, the key cannot be extracted.

### Callback URLs Never Leave the Server

The UI response shape includes only: `id`, `actionType`, `payload` (sanitized), `actorId`, `status`, `priority`, `dueDate`, `createdAt`, `updatedAt`.

Fields explicitly excluded: `callbackUrl`, `callbackMethod`, `callbackPayloadSpec`, `metadata`, `workflowInstanceId`, `workflowId`, `projectId`, `actorType`, `checkIn`.

### Short-Lived CHEFS JWT

The token returned by the CHEFS Gateway is short-lived (typically minutes). Even if intercepted, its utility window is minimal and it's scoped to a single form.

### Tenant Isolation

Every request is scoped to a tenant. A user in Tenant A cannot see or interact with actions belonging to Tenant B's projects, even if they know the action ID. The `getById` call includes `allowedProjectIds` in its query conditions.
