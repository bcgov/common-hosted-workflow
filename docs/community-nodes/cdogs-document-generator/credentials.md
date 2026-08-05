# Credentials

The CDOGS Document Generator node uses the dedicated **CDOGS OAuth2 API** credential type (`cdogsOAuth2Api`). It extends n8n's standard OAuth2 credential and fixes the grant type to **Client Credentials** so n8n signs every CDOGS request and refreshes tokens automatically.

## Setting Up the Credential

1. In n8n, go to **Settings → Credentials → Add Credential**
2. Search for **"CDOGS OAuth2 API"** and select it
3. Fill in the fields as described below

### Migrating an Existing Workflow

Workflows created before the dedicated credential was introduced reference the generic `oAuth2Api` credential and cannot migrate that encrypted credential automatically. After updating the community-node package:

1. Create a **CDOGS OAuth2 API** credential with the same token URL, client ID, client secret, scope, and authentication setting
2. Open each CDOGS node and select the new credential
3. Confirm the node's Base URL matches the credential environment (Dev, Test, or Prod)

## Credential Fields

| Field            | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Access Token URL | Your Keycloak/SSO token endpoint (see below)         |
| Client ID        | The client ID provisioned for your CDOGS integration |
| Client Secret    | The client secret for the above client               |
| Scope            | `openid` (fixed and hidden by the CDOGS credential)  |
| Authentication   | `Header` (fixed and hidden by the CDOGS credential)  |

### Access Token URL

The token endpoint depends on your environment:

| Environment | Token URL                                                                                |
| ----------- | ---------------------------------------------------------------------------------------- |
| Dev         | `https://dev.loginproxy.gov.bc.ca/auth/realms/comsvcauth/protocol/openid-connect/token`  |
| Test        | `https://test.loginproxy.gov.bc.ca/auth/realms/comsvcauth/protocol/openid-connect/token` |
| Prod        | `https://loginproxy.gov.bc.ca/auth/realms/comsvcauth/protocol/openid-connect/token`      |

> **Note:** These URLs use the BC Gov Common Single Sign-On (CSS) login proxy. Your specific realm may differ — check the integration details provided when your service account was provisioned.

## Example Configuration

| Field            | Example Value                                                                           |
| ---------------- | --------------------------------------------------------------------------------------- |
| Access Token URL | `https://dev.loginproxy.gov.bc.ca/auth/realms/comsvcauth/protocol/openid-connect/token` |
| Client ID        | `906B4222-742E0CC43BC`                                                                  |
| Client Secret    | `••••••••••••`                                                                          |
| Scope            | `openid` (automatically applied)                                                        |
| Authentication   | Header (automatically applied)                                                          |

## How Authentication Works

When you execute the CDOGS node:

1. n8n uses the OAuth2 credential to automatically fetch an access token from the configured token endpoint
2. The token is attached as a `Bearer` token in the `Authorization` header of every request to CDOGS
3. n8n handles token caching and refresh automatically

## Obtaining a CDOGS Service Account

To get a Client ID and Secret for CDOGS:

1. Submit an integration request through the [BC Gov Common Single Sign-On (CSS)](https://bcgov.github.io/sso-requests) self-service app
2. Select the **"Common Services"** realm (`comsvcauth`)
3. Request access to the **Common Document Generation Service**
4. Once approved, you'll receive a Client ID and Client Secret

## Troubleshooting

### "Authorization failed — Token issuer not allowed"

This typically means the token's `iss` claim doesn't match what CDOGS expects. Common causes:

- **Network/environment mismatch**: The CDOGS dev instance only accepts tokens from certain issuers. Ensure your token URL matches the CDOGS environment (e.g., don't use a dev token URL against a prod CDOGS endpoint).
- **Local development**: The login proxy may behave differently when accessed from outside the BC Gov network. If testing locally, ensure you're connected to the appropriate VPN or use the deployed n8n instance for integration testing.

### "Unauthorized" (401)

- Verify the Client ID and Client Secret are correct
- Ensure the node uses a **CDOGS OAuth2 API** credential rather than the generic **OAuth2 API** credential
- Check that the service account has been provisioned for CDOGS access in the CSS app
- Try clicking "Connect" on the credential to force a fresh token exchange

### "Request failed with status code 403"

- Your service account may not have permission for the specific CDOGS operation
- Contact the CSS team to verify your client's role assignments
