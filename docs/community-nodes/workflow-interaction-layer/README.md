# Workflow Interaction Layer (WIL-API Layer) — Custom n8n Node

The Workflow Interaction Layer (WIL-API Layer) is a custom n8n community node that provides a structured interface for managing **messages** and **actions** within n8n workflows. It enables workflows to send notifications to actors (users, groups, roles) and to create trackable actions (approvals, form submissions, event waits) with callback support.

## Overview

| Property        | Value                             |
| --------------- | --------------------------------- |
| Node name       | `workflowInteractionLayer`        |
| Display name    | Workflow Interaction Layer        |
| Style           | Programmatic (`execute()` method) |
| Version         | 1                                 |
| Credential      | `workflowInteractionLayerApi`     |
| Category        | Communication                     |
| AI-tool capable | Yes (`usableAsTool: true`)        |
| API base path   | `/rest/custom/v1`                 |

## Documentation Index

| Document                                | Description                                                             |
| --------------------------------------- | ----------------------------------------------------------------------- |
| [Architecture](./architecture.md)       | High-level design, data flow, authentication model, and project scoping |
| [API Reference](./api-reference.md)     | Complete REST API endpoint reference with request/response schemas      |
| [Node Operations](./node-operations.md) | Detailed guide to every resource and operation exposed in the n8n UI    |
| [Credentials](./credentials.md)         | Credential setup and configuration                                      |

## Source Files

```
community-nodes/
├── credentials/
│   └── WorkflowInteractionLayerApi.credentials.ts   # Credential definition
├── nodes/
│   └── WorkflowInteractionLayer/
│       ├── WorkflowInteractionLayer.node.ts          # Main node logic
│       ├── WorkflowInteractionLayer.node.json        # Codex metadata
│       └── shared/
│           ├── GenericFunctions.ts                    # HTTP helpers & auth
│           └── types.ts                              # TypeScript interfaces
```

## Quick Start

1. Configure credentials (see [Credentials](./credentials.md))
2. Drag the "Workflow Interaction Layer" node into your workflow
3. Select a resource (Message or Action) and an operation
4. The node auto-populates `workflowId` and `workflowInstanceId` from the current execution context
