---
title: CI Workflows
sidebar_label: Workflows
sidebar_position: 2
---

# CI Workflows

The CI design is split into lightweight, purpose-specific workflows rather than one monolithic pipeline. This keeps feedback targeted and allows individual lanes to evolve independently.

## Current CI Lanes

| Workflow            | Trigger                                     | Purpose                                                                               |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pre-commit-pr.yml` | `pull_request`                              | Runs commit linting and repository-wide pre-commit hooks against PR commits           |
| `pre-commit.yml`    | `push`                                      | Re-runs the same hygiene checks on pushed commits and may auto-commit generated fixes |
| `test.yml`          | `push`                                      | Validates package build, lint, and test steps for selected subprojects                |
| `deploy-docs.yml`   | `push` to `main` on docs changes, or manual | Builds and publishes the documentation site to `gh-pages`                             |

## Quality Gate Design

The CI posture is organized into two layers:

- **Repository hygiene:** commit message format, formatting, linting, YAML validation, secret scanning, and other `pre-commit` hooks.
- **Package validation:** targeted `pnpm` build, lint, bundle, and test commands for actively maintained packages.

This is intentionally not a full matrix build. The repository validates the areas with custom code and deployment impact while keeping execution time modest.

## Shared CI Building Blocks

Two composite actions standardize runner setup:

- `.github/actions/setup-tools`: installs ASDF-managed toolchain and Python-based utilities from `requirements.txt`.
- `.github/actions/setup-npm`: restores package dependencies for the repository and key workspaces, then fixes execute bits for local helper scripts.

This reduces duplication across workflows and keeps local and CI tooling aligned.

## Architectural Notes

- Workflows pin third-party actions by commit SHA, which improves supply-chain repeatability.
- Most workflows define `concurrency` and cancel superseded runs, which keeps noisy branches from building stale states.
- CI is broad enough to catch hygiene regressions quickly, but application test coverage is currently stronger on `push` than on `pull_request`.
