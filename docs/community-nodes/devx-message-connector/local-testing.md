# DevXMessageConnector Local Testing

This guide explains how to run the `DevXMessageConnector` unit tests locally.

## What These Tests Cover

The current Vitest suite is scoped to the `DevXMessageConnector` node in `community-nodes`.

- Test files live in `community-nodes/tests/DevXMessageConnector`
- Shared test utilities live in `community-nodes/tests/DevXMessageConnector/helpers.ts`
- Vitest is configured in `community-nodes/vitest.config.ts`
- The test command is defined in `community-nodes/package.json`

The tests exercise node-level behavior only. They validate how `DevXMessageConnector.execute()` routes payloads by type and source, transforms message content, handles invalid payloads, and builds outbound requests.

## Prerequisites

Before running the tests locally, make sure you have the repo checked out and the project tooling installed.

- Follow `docs/development-setup/local-development-environment.md` if you have not set up the repo yet
- Make sure `pnpm` is available in your shell
- Install dependencies in `community-nodes`

## Install Dependencies

From the repository root:

```sh
cd community-nodes
pnpm install
```

## Run All DevXMessageConnector Tests

From `community-nodes`:

```sh
pnpm test
```

This runs:

```sh
vitest run
```

Vitest picks up test files from:

```text
tests/**/*.test.ts
```

## Run a Single Test File

If you only want to run one source-specific suite, use Vitest directly.

Examples:

```sh
pnpm exec vitest run tests/DevXMessageConnector/github.test.ts
pnpm exec vitest run tests/DevXMessageConnector/html.test.ts
pnpm exec vitest run tests/DevXMessageConnector/node.test.ts
```

## Current Test Layout

The suite is split by node behavior and source type:

- `community-nodes/tests/DevXMessageConnector/node.test.ts`
- `community-nodes/tests/DevXMessageConnector/text.test.ts`
- `community-nodes/tests/DevXMessageConnector/html.test.ts`
- `community-nodes/tests/DevXMessageConnector/generic.test.ts`
- `community-nodes/tests/DevXMessageConnector/rocket-chat.test.ts`
- `community-nodes/tests/DevXMessageConnector/github.test.ts`
- `community-nodes/tests/DevXMessageConnector/backup-container.test.ts`
- `community-nodes/tests/DevXMessageConnector/sysdig.test.ts`
- `community-nodes/tests/DevXMessageConnector/uptime-com.test.ts`

## Common Local Commands

Run the full suite:

```sh
cd community-nodes
pnpm test
```

Run one file:

```sh
cd community-nodes
pnpm exec vitest run tests/DevXMessageConnector/sysdig.test.ts
```

Run multiple DevXMessageConnector files:

```sh
cd community-nodes
pnpm exec vitest run tests/DevXMessageConnector/github.test.ts tests/DevXMessageConnector/node.test.ts
```
