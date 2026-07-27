---
title: High-Level Architecture
sidebar_label: Architecture
sidebar_position: 1
---

# High-Level Architecture

```mermaid
flowchart TB
    User([User])

    subgraph Openshift["Gov Private Cloud (Openshift)"]
        direction TB

        subgraph Platform["Platform Services"]
            Keycloak["SSO Keycloak\n(Authentication)"]
            APIGW["API Gateway"]
            APIs["Approved / Published\nAPI Services"]
        end

        subgraph Common["Common Services"]
            CSTAR["CSTAR\n(Connected Services, Team Access & Roles)"]
            BCNotify["BC Notify\n(Email & SMS)"]
        end

        WorkflowEngine["Workflow Engine"]

        subgraph Data["Stateful Services"]
            Postgres["PostgreSQL\n(managed by PGO)"]
            Redis["Redis Server"]
        end
    end

    User -->|"Access workflow app"| WorkflowEngine
    WorkflowEngine -->|"Redirect for login"| Keycloak
    Keycloak -->|"OIDC token / session"| User
    User -->|"Authenticated request"| WorkflowEngine

    WorkflowEngine -->|"Get user tenants & roles"| CSTAR
    CSTAR -->|"Tenants / roles"| WorkflowEngine

    WorkflowEngine -->|"Persist workflow data"| Postgres
    WorkflowEngine -->|"Cache / transient state"| Redis

    WorkflowEngine -->|"Send email / SMS"| BCNotify
    WorkflowEngine -->|"Consume approved APIs"| APIGW
    APIGW -->|"Route to"| APIs
```

## Components

| Component           | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| **Workflow Engine** | Hosts Node-RED based workflows; entry point for authenticated users |
| **SSO Keycloak**    | Authenticates users on login (deployed on Openshift)                |
| **CSTAR**           | Common service providing user tenants and roles for authorization   |
| **PostgreSQL**      | Persistent workflow data store, managed by PGO                      |
| **Redis Server**    | Caching and transient workflow state                                |
| **BC Notify**       | Common service used by workflow nodes for Email and SMS             |
| **API Gateway**     | Gateway fronting approved/published API services on Openshift       |
