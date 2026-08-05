# Credentials

The CDOGS Document Generator node uses the built-in **OAuth2 API** credential type (`oAuth2Api`) with a **Client Credentials** grant. This avoids the need for a custom credential — you configure it directly in n8n's standard OAuth2 credential form.

## Setting Up the Credential

1. In n8n, go to **Settings → Credentials → Add Credential**
2. Search for **"OAuth2 API"** and select it
3. Fill in the fields as described below

## Credential Fields

| Field            | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| Grant Type       | `Client Credentials`                                    |
| Access Token URL | Your Keycloak/SSO token endpoint (see below)            |
| Client ID        | The client ID provisioned for your CDOGS integration    |
| Client Secret    | The client secret for the above client                  |
| Scope            | `openid` (or as required by your integration)           |
| Authentication   | `Body` (sends client_id/client_secret in the POST body) |

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
| Grant Type       | Client Credentials                                                                      |
| Access Token URL | `https://dev.loginproxy.gov.bc.ca/auth/realms/comsvcauth/protocol/openid-connect/token` |
| Client ID        | `906B4222-742E0CC43BC`                                                                  |
| Client Secret    | `••••••••••••`                                                                          |
| Scope            | `openid`                                                                                |
| Authentication   | Body                                                                                    |

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
- Ensure the credential's Grant Type is set to "Client Credentials"
- Check that the service account has been provisioned for CDOGS access in the CSS app
- Try clicking "Connect" on the credential to force a fresh token exchange

### "Request failed with status code 403"

- Your service account may not have permission for the specific CDOGS operation
- Contact the CSS team to verify your client's role assignments
