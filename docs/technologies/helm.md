---
title: Helm
sidebar_label: Helm
sidebar_position: 3
---

# Helm

Helm is the repository's deployment composition layer.

GitHub Actions orchestrates delivery, but Helm is what actually describes and applies the runtime shape of the platform on OpenShift.

## Why This Project Uses Helm

The platform needs one deployment mechanism that can:

- compose multiple runtime components
- express environment-specific differences
- promote immutable image tags across environments
- encode DR-specific behavior without duplicating entire manifests

Helm provides that composition model.

## How This Repository Uses It

The main application chart is `helm/main`.

It composes dependencies and local charts for:

- n8n
- Crunchy PGO
- Redis
- backup storage
- DNS probe
- mock application
- optional observability components

There is also a separate `helm/tools` chart for shared tools-namespace services.

## Deployment Model

Application deployments follow this pattern:

1. GitHub Actions authenticates to OpenShift.
2. The workflow passes `NAMESPACE`, `IMAGE_TAG`, and `CLUSTER` into the chart Makefile.
3. Helm applies `values.yaml` plus the selected `values-<namespace>-<cluster>.yaml` overlay.
4. Promoted image tags are injected through `--set` values.

This makes Helm the repository's environment and topology control plane.

## Why It Matters Architecturally

The chart layer expresses several platform behaviors that are larger than simple application config:

- queue-mode n8n topology
- PostgreSQL and Redis enablement
- backup schedules and DR restore behavior
- Route exposure and NetworkPolicy
- optional observability stack activation

For the repo, Helm is not just templating. It is the encoded runtime architecture.

For deployment details, see [Helm Deployment Model](../ci-cd/cd/helm-deployment-model.md).

## Key Source Files

- `helm/main/Chart.yaml`
- `helm/main/values.yaml`
- `helm/main/Makefile`
- `helm/tools/Chart.yaml`
- `.github/workflows/_deploy.yml`
