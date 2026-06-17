# Workflow Interaction Layer (WIL) — External UI

## Overview

The Workflow Interaction Layer (WIL) is the user-facing interface that allows authenticated users to interact with n8n workflow actions and messages. It bridges the gap between automated workflow executions and human decision points — approvals, form submissions, event acknowledgements, and notifications.

WIL is implemented across two packages:

- **external-hooks** (Express backend mounted on n8n) — provides the `/ui-api/wil/` REST API with tenant-scoped, actor-filtered endpoints.
- **external-ui** (React/Vite SPA) — provides the `/workflow-interaction` page with a split-pane layout for browsing and interacting with actions.

## Key Principles

1. **Sensitive data stays server-side.** Callback URLs, FormAPIKeys, and internal metadata never reach the browser.
2. **Tenant-scoped access.** Every request is scoped to a tenant via the `X-TENANT-ID` header, resolved to project IDs.
3. **Actor-based filtering.** Actions and messages are matched to the logged-in user by email (primary) or OIDC subject (fallback).
4. **Security through proxying.** The callback proxy pattern ensures the frontend cannot forge upstream webhook calls or discover internal URLs.

## Documentation Index

| Document                                                  | Description                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| [Architecture](./architecture.md)                         | System diagram, component hierarchy, and data flow              |
| [Authentication & Tokens](./authentication-and-tokens.md) | OIDC session, CHEFS token exchange, user context passing        |
| [CHEFS Integration](./chefs-integration.md)               | ChefsFormViewer component, script loading, prefill & submission |
| [Action Handlers](./action-handlers.md)                   | GetApproval, ShowForm, WaitOnEvent — behavior and design        |
| [Backend API](./backend-api.md)                           | WIL router endpoints, callback proxy, response shaping          |
| [Future Work](./future-work.md)                           | Workflow triggers, claim/unclaim, auto-expiry, and more         |

## Quick Reference

### Supported Action Types

| Type          | User Experience                             |
| ------------- | ------------------------------------------- |
| `getapproval` | View HTML content, click an approval option |
| `showform`    | Fill and submit an embedded CHEFS form      |
| `waitonevent` | Click a single confirmation button          |

### API Endpoints

| Method | Path                      | Purpose                                       |
| ------ | ------------------------- | --------------------------------------------- |
| GET    | `/ui-api/wil/tenants`     | List available tenants                        |
| GET    | `/ui-api/wil/actions`     | List actions (tenant-scoped, actor-filtered)  |
| GET    | `/ui-api/wil/messages`    | List messages (tenant-scoped, actor-filtered) |
| POST   | `/ui-api/wil/callback`    | Proxy interaction response upstream           |
| POST   | `/ui-api/wil/chefs-token` | Exchange FormAPIKey for short-lived CHEFS JWT |
