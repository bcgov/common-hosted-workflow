# Rocket.Chat migration

## How to Run

### 1. Prepare your CSV

Ensure your `rocketchat-migration-sample.csv` is in the same directory. The headers must match the `CSV_COLUMNS` defined in the script exactly:

- `Rocket.Chat Webhook URL`
- `The Webhook name`
- `The valid IDIR user email`
- `The source type`
- `The target Teams channel ID`

### 2. Set Environment Variables (Recommended)

Rather than hardcoding your API key, run the script with environment variables for security:

```bash
N8N_BASE_URL="https://your-n8n-instance.com" \
N8N_API_KEY="your_actual_api_key" \ # pragma: allowlist secret
node migration.mjs

```

### 3. Review Output

Once finished, the script will generate `rocketchat-migration-output.csv`.

- **Status Column:** Look for "Success" or "Failed".
- **Error Column:** If a row failed, the specific reason (e.g., `User lookup failed`) will be listed here.

## Script Logic Overview

The script follows a specific "Linkage" architecture to ensure data integrity across n8n's relational structure:

1. **User Provisioning:** It checks if the user exists. If not, it invites them, which triggers n8n to auto-create a "Personal Project" for that user.
2. **Workflow Creation:** It creates a global workflow (currently empty).
3. **Project Association:** It "moves" the workflow from the global scope into the specific user's project, effectively giving that user ownership.

## Troubleshooting

- **404 on Project Endpoint:** If the script fails to find a project even after creating a user, increase the `setTimeout` in `ensureUserAndGetProject`. Sometimes n8n takes a second to provision the background database entry for a new project.
- **403 Forbidden:** Ensure your API Key has **Admin** permissions.
- **ECONNRESET:** If you see this, reduce the `CONCURRENCY_LIMIT` to `1` or `2` to lower the pressure on your server's network stack.
