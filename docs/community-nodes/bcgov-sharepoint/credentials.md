# Credentials

The BC Gov SharePoint node uses the **BC Gov SharePoint OAuth2 API** credential type (`bcGovSharePointOAuth2Api`). It extends n8n's standard OAuth2 credential and fixes the grant type to **Client Credentials** so n8n signs every Graph request and refreshes tokens automatically.

## Prerequisites

Before configuring the credential, you need:

1. **Azure AD App Registration** with:
   - `Sites.Selected` application permission on **Microsoft Graph**
   - (Optional, for Ensure User) `Sites.Selected` application permission on **Office 365 SharePoint Online**
2. **Admin consent** — a tenant admin must grant admin consent for the permissions
3. **Site-level access** — an M365 admin must explicitly grant the app write access to each target site:

   ```http
   POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions
   Content-Type: application/json

   {
     "roles": ["write"],
     "grantedToIdentities": [{
       "application": {
         "id": "<your-client-id>",
         "displayName": "CHWF SharePoint Integration"
       }
     }]
   }
   ```

   Replace `{siteId}` with the site's composite ID (e.g. `bcgov.sharepoint.com,<collection-guid>,<web-guid>`).

## Setting Up the Credential

1. In n8n, go to **Settings → Credentials → Add Credential**
2. Search for **"BC Gov SharePoint OAuth2 API"** and select it
3. Fill in the fields as described below
4. Click **Save** — the credential test verifies access to the configured Default Site URL

## Credential Fields

| Field              | Type            | Required | Default                            | Description                                                             |
| ------------------ | --------------- | -------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Tenant ID          | string          | Yes      | —                                  | Azure AD tenant GUID or domain (e.g. `bcgov.onmicrosoft.com`)           |
| Client ID          | string          | Yes      | —                                  | The app registration's client ID                                        |
| Client Secret      | string/password | Yes      | —                                  | The app registration's client secret                                    |
| Graph Base URL     | string          | Yes      | `https://graph.microsoft.com/v1.0` | Override for GCC High or beta endpoints                                 |
| Default Site URL   | string          | No       | —                                  | Fallback site when the node's Site field is blank; also the test target |
| Metadata Cache TTL | number          | Yes      | `15`                               | Minutes to cache site/list/column metadata; `0` disables                |
| Max Retries        | number          | Yes      | `3`                                | Retry attempts on Graph 429/503 responses                               |

### Hidden / Auto-Configured Fields

These are set automatically by the credential definition and do not appear in the UI:

| Field            | Value                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| Grant Type       | `clientCredentials`                                                             |
| Authentication   | `body`                                                                          |
| Scope            | `https://graph.microsoft.com/.default`                                          |
| Access Token URL | `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` (auto-derived) |

## How Authentication Works

1. n8n's OAuth2 machinery uses the Client Credentials grant to fetch an access token from Azure AD
2. The token is cached and refreshed automatically by n8n
3. Every Graph API request includes the token as a `Bearer` header
4. The `Sites.Selected` permission limits access to only the sites where the app has been explicitly granted permission

## Credential Test

When you save the credential, n8n issues:

```
GET {graphBaseUrl}/sites/{hostname}:/{path}
```

against the **Default Site URL**. If the app registration has been granted `Sites.Selected` access to that site, the test passes. If the Default Site URL is blank, the test is skipped.

> **Note:** The credential test does NOT call `/sites/root` because under `Sites.Selected` that returns 403 even for a valid credential.

## Example Configuration

| Field              | Value                                             |
| ------------------ | ------------------------------------------------- |
| Tenant ID          | `bcgov.onmicrosoft.com`                           |
| Client ID          | `12345678-abcd-efgh-ijkl-123456789012`            |
| Client Secret      | `••••••••••••`                                    |
| Graph Base URL     | `https://graph.microsoft.com/v1.0`                |
| Default Site URL   | `https://bcgov.sharepoint.com/sites/ENV-STB-TEST` |
| Metadata Cache TTL | `15`                                              |
| Max Retries        | `3`                                               |

## Environment-Specific Notes

### BC Gov GCC High

If your tenant uses Microsoft's Government Community Cloud High (GCC High), override:

| Field          | GCC High Value                    |
| -------------- | --------------------------------- |
| Graph Base URL | `https://graph.microsoft.us/v1.0` |

The Access Token URL is derived from the Tenant ID, so it will automatically target the correct Azure AD authority for your tenant.

### Multiple Sites

The credential's **Default Site URL** is used as a fallback when the node's Site field is left blank. To work with multiple sites in a single workflow, override the Site parameter on each node instance — you do not need multiple credentials (as long as the app registration has `Sites.Selected` access to all target sites).

## Troubleshooting

### "Access denied" / 403 on a specific site

- The app registration must have explicit `Sites.Selected` permission on that site. Unlike `Sites.ReadWrite.All`, `Sites.Selected` does NOT provide blanket access — each site must be individually granted.
- Use the Graph API `POST /sites/{siteId}/permissions` call (see Prerequisites) to grant access.

### "Unauthorized" (401)

- Verify the Client ID, Client Secret, and Tenant ID are correct
- Ensure admin consent has been granted for the `Sites.Selected` permission
- Try deleting and recreating the credential to force a fresh token

### Credential test fails with 404

- The **Default Site URL** may be incorrect — verify the URL opens in a browser
- Ensure the URL format is `https://{tenant}.sharepoint.com/sites/{siteName}`

### Token endpoint returns "invalid_client"

- Double-check the Client Secret hasn't expired in Azure AD
- Verify the Client ID matches the app registration (not the object ID)

### "Sites.Selected" vs "Sites.ReadWrite.All"

| Permission          | Scope     | Admin consent | Use case                                  |
| ------------------- | --------- | ------------- | ----------------------------------------- |
| Sites.Selected      | Per-site  | Per-site      | Production — principle of least privilege |
| Sites.ReadWrite.All | All sites | Tenant-wide   | Development/testing only                  |

For production, always use `Sites.Selected` and grant access only to the specific sites your workflow needs.
