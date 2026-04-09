# SDG Mock App — Next.js

A Next.js application that serves as a demo frontend for the Workflow Interaction Layer (WIL) and CHEFS form rendering. Runs on port **8081**.

## Pages

### 1. SDG Demo Dashboard — `/`

Interactive dashboard for the Workflow Interaction Layer API. Provides a three-panel layout:

- **Forms** — Submit forms (e.g. Disability Credit Application) to trigger n8n workflows.
- **Messages** — View messages returned by the workflow for a given actor.
- **Action Requests** — View and respond to pending actions (approvals, confirmations, etc.).

Configure the API connection via the **Settings** gear icon (base URL, API key, optional CORS proxy). Filter by Actor ID, date range, and limit.

```
http://localhost:8081/
```

---

### 2. CHEFS Form Preview — `/check-form-rendering`

Renders any [CHEFS](https://submit.digital.gov.bc.ca) form using the `chefs-form-viewer` web component. Useful for testing form rendering and webhook integration outside of CHEFS itself.

#### URL Parameters

| Parameter    | Required | Description                     |
| ------------ | -------- | ------------------------------- |
| `form-id`    | Yes      | The CHEFS form UUID             |
| `auth-token` | No       | API key for authenticated forms |

#### Example

```
http://localhost:8081/check-form-rendering?form-id=FORM_ID&auth-token=AUTH_TOKEN
```

#### Features

- **Webhook forwarding** — Click the ⚙️ gear icon to set a webhook URL. On form submission, the data is POSTed to that URL. A ⚠️ warning icon appears when no URL is configured.
- **Persistent config** — The webhook URL is stored in `localStorage` under the `chef_config` key and auto-loaded on next visit.
- **Reset** — After submission, a **Reset** button appears to reload the form to its initial empty state.

## Development

```bash
npm install
npm run dev
```

The app proxies `/rest/*`, `/webhook/*`, and `/webhook-waiting/*` requests to the n8n instance (default `http://localhost:5678`, override with `N8N_TARGET` env var).
