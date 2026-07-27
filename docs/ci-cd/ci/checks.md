---
title: CI Checks
sidebar_label: Checks
sidebar_position: 1
---

# CI Checks

This repository uses a layered CI model: fast hygiene checks for every contribution, followed by targeted package validation on pushes.

## Hygiene Checks

The primary guardrail is the [pre-commit framework](https://pre-commit.com/), defined in [`.pre-commit-config.yaml`](../../../.pre-commit-config.yaml).

The same policy runs in three places:

- **Local development:** hooks run before commit and catch issues early.
- **Pull requests:** [`pre-commit-pr.yml`](../../../.github/workflows/pre-commit-pr.yml) validates PR commit history and repository checks.
- **Pushes:** [`pre-commit.yml`](../../../.github/workflows/pre-commit.yml) validates pushed commits and can auto-commit generated fixes when configured by the action.

In practice, this lane covers the repository-level contract:

- commit message format through `commitlint`
- formatting and linting hooks
- YAML and basic structural validation
- secret detection and other security-oriented hooks

## Package Validation

[`test.yml`](../../../.github/workflows/test.yml) runs push-based validation for actively maintained packages:

- `community-nodes`: build and unit tests
- `docker-compose/sdg-mock-app`: lint and build
- `external-hooks`: lint, bundle, and tests
- `external-ui`: lint

This workflow confirms that the code that feeds runtime artifacts and integrations still builds cleanly after changes land.

## Why This Matters

Architecturally, CI is optimized for fast feedback and practical enforcement rather than exhaustive build matrices. That gives the team a stable baseline:

- malformed commits and repository drift are blocked early
- deployable packages are validated on push
- branch protection can treat these workflows as merge and release gates

For the broader workflow inventory, see [CI Workflows](./workflows.md).
