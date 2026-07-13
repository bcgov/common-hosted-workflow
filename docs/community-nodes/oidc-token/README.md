# OIDC Token — Custom n8n Node

The OIDC Token node fetches an OAuth2 access token from an OpenID Connect Identity Provider (Keycloak, Okta, Auth0, etc.) and optionally **decodes** or **cryptographically verifies** the returned JWT, appending its claims back into the n8n execution data.

It supports two OAuth2 grant types:

- **Client Credentials** — machine-to-machine flow using a client id and secret ([RFC 6749 §4.4](https://datatracker.ietf.org/doc/html/rfc6749#section-4.4))
- **Password** — Resource Owner Password Credentials flow using a username and password ([RFC 6749 §4.3](https://datatracker.ietf.org/doc/html/rfc6749#section-4.3))

## Overview

| Property         | Value                             |
| ---------------- | --------------------------------- |
| Node name        | `oidcToken`                       |
| Display name     | OIDC Token                        |
| Style            | Programmatic (`execute()` method) |
| Version          | 1                                 |
| Credential       | `oidcToken`                       |
| Category         | Development / Transform           |
| AI-tool capable  | Yes (`usableAsTool: true`)        |
| Supported grants | Client Credentials, Password      |

## Documentation Index

| Document                                | Description                                                           |
| --------------------------------------- | --------------------------------------------------------------------- |
| [Architecture](./architecture.md)       | High-level design, token flow, verification model, and security notes |
| [Node Operations](./node-operations.md) | Detailed guide to every node property and the three processing modes  |
| [Credentials](./credentials.md)         | Credential setup and endpoint discovery configuration                 |

## Source Files

```
community-nodes/
├── credentials/
│   └── OidcToken.credentials.ts          # Credential definition
├── nodes/
│   └── OidcToken/
│       ├── OidcToken.node.ts             # Main node logic
│       ├── OidcToken.node.json           # Codex metadata
│       └── shared/
│           └── GenericFunctions.ts       # HTTP, JWT decode/verify helpers
└── tests/
    └── OidcToken/
        ├── helpers.ts                    # Test harness
        └── OidcToken.test.ts             # Unit tests
```

## Quick Start

1. Configure the OIDC credentials (see [Credentials](./credentials.md)). For the Password grant, set the **Resource Owner Username** and **Password** fields on the credential.
2. Drag the "OIDC Token" node into your workflow
3. Choose a **Grant Type** (`Client Credentials` or `Password`)
4. Choose a **Token Processing Mode** (`None`, `Decode`, or `Verify`)
5. The node returns the token response (enriched with `tokenClaims` and `decodedToken` when Decode/Verify is selected)
