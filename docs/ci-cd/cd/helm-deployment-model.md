---
title: Helm Deployment Model
sidebar_label: Helm Deployment Model
sidebar_position: 2
---

# Helm Deployment Model

GitHub Actions is the orchestration layer, but Helm is the real deployment mechanism.

## Main Application Chart

The primary deployment surface is the `helm/main` chart, deployed with release name `chwf`.

The chart composes several capabilities behind feature flags and per-environment overlays:

| Capability                           | Source                             |
| ------------------------------------ | ---------------------------------- |
| n8n runtime                          | local `_n8n` chart                 |
| PostgreSQL operator-managed database | local `_pgo` chart                 |
| Redis                                | Bitnami dependency                 |
| backup storage job model             | `backup-storage` dependency        |
| DNS probe                            | local `_dns-probe` chart           |
| mock application                     | local `_sdg-mock-app` chart        |
| optional observability stack         | Alloy, Loki, Tempo, Mimir, Grafana |

This design keeps one deployment primitive while allowing different environment profiles to enable only the components they need.

## Deploy Execution Path

All application deployments converge on the same pattern:

1. GitHub Actions checks out the repository.
2. The runner installs the required toolchain.
3. The workflow authenticates to OpenShift using environment-scoped credentials.
4. `make upgrade` runs inside `helm/main`.
5. Helm performs `dependency update` and `upgrade --install`.
6. The workflow waits for the four n8n deployments: `main`, `worker`, `webhook`, and `runner`.

That final point matters operationally: the workflow verifies n8n availability, but it does not explicitly wait on every auxiliary component.

## Values Layering

The main chart Makefile enforces a strict layering model:

```text
helm upgrade --install chwf . \
  -n <namespace> \
  -f values.yaml \
  -f values-<namespace>-<cluster>.yaml \
  --set n8n.image.tag=<tag> \
  --set sdg-mock-app.image.tag=<tag> \
  --set dns-probe.image.tag=<tag>
```

This creates a clean separation between:

- platform defaults in `values.yaml`
- environment and cluster-specific overrides in overlay files
- promoted artifact identity through `--set ...image.tag`

## OpenShift-Specific Platform Assumptions

The charts are intentionally OpenShift-aware.

Examples visible in the chart set include:

- `Route` resources for ingress exposure
- namespace-oriented `NetworkPolicy` rules
- `oc` usage in Makefile targets
- storage classes aligned to OpenShift-backed NetApp storage

This is not a generic Kubernetes delivery stack. It is tuned to the BC Gov OpenShift operating model.

## DR And Recovery Posture

The Helm overlays encode different recovery behavior between primary and DR clusters.

Patterns present in current values files include:

- disabling `backup-storage` on `golddr`
- excluding trigger-based n8n nodes on DR
- enabling `pgo.conditionalRestore` in selected DR environments
- using `dns-probe` to determine when a restore action should run

The conditional restore capability is implemented as a CronJob in the local PGO chart and is designed to restore from S3-backed backups when DR is active.

For backup and restore design details, see [Database Backup Process](../../platform/database-backup-process.md).

For the full operational explanation of how Gold and GoldDR behave during failover, see [Gold And GoldDR Failover Model](../../platform/gold-dr-failover.md).

## Tools Namespace

`helm/tools` is a separate chart deployed to the tools namespace. It currently manages SeaweedFS and related access control.

This namespace plays a platform-support role rather than an application runtime role:

- it is deployed through `deploy-tools.yml`
- it uses its own Helm chart and values overlays
- it can expose SeaweedFS S3 to selected namespaces through cross-namespace `NetworkPolicy`

Some main-environment overlays reference this tools namespace for observability object storage endpoints.

## Operational Notes

- Every `upgrade` run deletes successful completed Jobs before deploying.
- Release name is consistently `chwf` across the main and tools charts.
- The chart already contains dormant optional capabilities such as observability components, even if some overlays keep them disabled.
