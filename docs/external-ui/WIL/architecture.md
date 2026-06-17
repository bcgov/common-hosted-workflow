# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (external-ui)                           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │              /workflow-interaction Page (Split-Pane)                  │   │
│  │                                                                      │   │
│  │  ┌─────────────────────┐    ┌────────────────────────────────────┐  │   │
│  │  │   Action List Pane  │    │       Action Detail Pane            │  │   │
│  │  │                     │    │                                      │  │   │
│  │  │  • Status filter    │    │  ┌─────────────────────────────┐    │  │   │
│  │  │  • Action cards     │    │  │ GetApprovalHandler          │    │  │   │
│  │  │  • Load More        │    │  │ ShowFormHandler              │    │  │   │
│  │  │                     │    │  │ WaitOnEventHandler           │    │  │   │
│  │  │                     │    │  │ CompletedActionView          │    │  │   │
│  │  │                     │    │  └─────────────────────────────┘    │  │   │
│  │  └─────────────────────┘    └────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Service Layer: services/backend/wil.ts + auth.ts + axios.ts         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────┘
        │                    │                     │
        │ GET /actions       │ POST /callback      │ POST /chefs-token
        │ GET /messages      │                     │
        │ GET /tenants       │                     │
        ▼                    ▼                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                     external-hooks (Express on n8n)                            │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │  /ui-api/wil Router (buildWilRouter)                                   │   │
│  │                                                                        │   │
│  │  Middleware: requireUiRequestContext (OIDC session validation)          │   │
│  │                                                                        │   │
│  │  Helpers:                                                              │   │
│  │   • resolveWilTenantProjectIds — tenant → project IDs                  │   │
│  │   • resolveActorIds — session → email/subject                          │   │
│  │   • mapActionToUiResponse — strip sensitive fields                     │   │
│  │   • formatListResponse — keyset pagination cursor                      │   │
│  │                                                                        │   │
│  │  Services:                                                             │   │
│  │   • ActionService.list() / .getById() / .updateStatus()                │   │
│  │   • MessageService.list()                                              │   │
│  │   • ChefsService.getFormToken()                                        │   │
│  │   • TenantService.listTenants()                                        │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────┘
        │                                          │
        │ Forward callback body                    │ Basic Auth token exchange
        ▼                                          ▼
┌─────────────────────┐               ┌──────────────────────────────┐
│  n8n Webhook URL    │               │  CHEFS Gateway API           │
│  (upstream callback)│               │  /auth/token/forms/{formId}  │
└─────────────────────┘               └──────────────────────────────┘
```

## Component Hierarchy (Frontend)

```
WorkflowInteraction (page — pages/workflow-interaction.tsx)
├── TenantSelector (components/wil/tenant-selector.tsx)
├── DateFilter (components/wil/date-filter.tsx)
├── TabBar (components/wil/tab-bar.tsx)
├── StatusFilter (components/wil/status-filter.tsx)
├── Split-Pane Grid
│   ├── ActionsTab (components/wil/actions-tab.tsx)
│   │   └── ActionItem[] (components/wil/action-item.tsx)
│   └── ActionDetailPane (components/action-detail-pane.tsx)
│       ├── Placeholder (no selection)
│       ├── GetApprovalHandler (components/action-handlers/get-approval-handler.tsx)
│       ├── ShowFormHandler (components/action-handlers/show-form-handler.tsx)
│       │   └── ChefsFormViewer (components/chefs/chefs-form-viewer.tsx)
│       │       └── <chefs-form-viewer> (web component)
│       ├── WaitOnEventHandler (components/action-handlers/wait-on-event-handler.tsx)
│       ├── CompletedActionView (components/action-handlers/completed-action-view.tsx)
│       └── UnsupportedAction (fallback)
└── MessagesTab (components/wil/messages-tab.tsx)
    └── MessageItem (inline)
```

### File Organization

The frontend is organized by domain:

```
external-ui/src/
├── pages/
│   └── workflow-interaction.tsx         ← Page shell (state, layout, routing)
├── components/
│   ├── wil/                            ← WIL page sub-components
│   │   ├── index.ts                    ← Barrel export
│   │   ├── tenant-selector.tsx         ← Tenant dropdown (react-query)
│   │   ├── date-filter.tsx             ← Time range filter + computeSinceDate()
│   │   ├── status-filter.tsx           ← Multi-select status toggle
│   │   ├── tab-bar.tsx                 ← Actions/Messages tab switcher
│   │   ├── actions-tab.tsx             ← Action list with query + pagination
│   │   ├── action-item.tsx             ← Single action card (badges)
│   │   └── messages-tab.tsx            ← Message list with query + pagination
│   ├── action-handlers/                ← Action type interaction handlers
│   │   ├── shared/
│   │   │   └── error-utils.ts          ← Shared extractErrorMessage utility
│   │   ├── get-approval-handler.tsx
│   │   ├── show-form-handler.tsx
│   │   ├── wait-on-event-handler.tsx
│   │   └── completed-action-view.tsx
│   ├── action-detail-pane.tsx          ← Handler dispatcher (routes by actionType)
│   └── chefs/                          ← CHEFS form viewer integration
│       ├── chefs-form-viewer.tsx
│       ├── use-chefs-script.hook.ts
│       └── types.ts
└── services/backend/
    ├── wil.ts                          ← WIL API service functions
    ├── auth.ts                         ← Whoami / session calls
    └── axios.ts                        ← Axios instance + token storage
```

## Backend Route Structure

```
Express app (n8n)
└── /ui-api (buildUiApiRouter)
    ├── /session, /auth/*, /whoami, /workflows (existing)
    └── /wil (buildWilRouter — sub-router)
        ├── GET  /tenants        → TenantService.listTenants()
        ├── GET  /messages       → MessageService.list()
        ├── GET  /actions        → ActionService.list() + mapActionToUiResponse
        ├── POST /chefs-token    → ActionService.getById() + ChefsService.getFormToken()
        └── POST /callback       → ActionService.getById() + fetch(callbackUrl) + updateStatus()
```

## Request Lifecycle

### Standard Action List Request

1. **Browser** sends `GET /ui-api/wil/actions?status=pending&limit=20` with headers:
   - `Authorization: Bearer <app-token>`
   - `X-TENANT-ID: <uuid>`

2. **requireUiRequestContext** middleware validates the Bearer JWT, attaches session.

3. **resolveWilTenantProjectIds** extracts and validates `X-TENANT-ID`, queries `tenant_project_relation` table for project IDs.

4. **resolveActorIds** extracts `email` (primary) and `subject` (fallback) from the OIDC session.

5. **Zod schema** parses query params (`limit`, `since`, `status`).

6. **ActionService.list()** queries `action_requests` table with:
   - `projectId IN (resolved project IDs)`
   - `actorId = primary email`
   - `status IN (filter values)`
   - Keyset pagination conditions

7. If zero results with primary actor → retry with fallback (subject).

8. **mapActionToUiResponse** strips sensitive fields from each action.

9. **formatListResponse** adds `nextCursor` if results fill the limit.

10. Response returned to browser.

### Callback Proxy Request

1. **Browser** sends `POST /ui-api/wil/callback` with body `{ actionId, body: {...} }`.

2. Backend fetches the full action record (including `callbackUrl`, `callbackMethod`).

3. If `callbackMethod === 'NONE'` or URL is empty → mark completed, return.

4. Otherwise, forward `body` to `callbackUrl` with 30-second timeout.

5. On upstream 2xx → update action status to `completed` → return success.

6. On upstream error → return error without updating status (user can retry).

## Key Architectural Decisions

### Why a Callback Proxy?

The n8n webhook URLs contain internal routing information. Exposing them to the browser would:

- Allow users to bypass the UI and call webhooks directly
- Reveal internal infrastructure details
- Prevent server-side audit logging of interactions

The proxy fetches the URL from the DB at call time, ensuring the frontend only needs the `actionId`.

### Why Separate CHEFS Token Exchange?

The CHEFS `FormAPIKey` is a long-lived secret that grants full API access to a form. The exchange endpoint:

- Keeps the key server-side (never sent to browser)
- Returns a short-lived JWT scoped to one form
- Allows the backend to validate the action exists and belongs to the actor before issuing a token

### Why Keyset Pagination?

Offset-based pagination (`OFFSET N`) suffers from drift when new records are inserted. Keyset pagination using `createdAt|id` cursors provides:

- Stable results as new actions arrive
- O(1) performance regardless of offset depth
- Simple "Load More" UX without page numbers

### Why Actor Fallback?

Actions can be created with either the user's email or OIDC subject as the `actorId`. The fallback strategy (try email first, then subject) ensures users see their actions regardless of which identifier was used during workflow execution.
