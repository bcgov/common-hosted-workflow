---
title: Gold/GoldDR Failover
sidebar_label: Gold/GoldDR Failover
sidebar_position: 3
---

# Gold/GoldDR Failover

This repository deploys to the BC Gov Private Cloud Gold tier, which consists of a primary Gold cluster and a warm-standby GoldDR cluster.

The authoritative service-level description lives in the [Internal Service Agreement](./internal-service-agreement.md), especially:

- §2 `Hosting Tier & Cluster Scope`
- §4 `Behaviour During a Failover`
- §5 `The DR→Gold Data-Syncing Constraint`
- §6 `Business Continuity Objectives`

This page translates that operating model into delivery and deployment terms.

## Cluster Roles

| Cluster | Role         | Normal traffic posture                                                |
| ------- | ------------ | --------------------------------------------------------------------- |
| Gold    | Primary      | Receives normal service traffic                                       |
| GoldDR  | Warm standby | Already running, ready to receive traffic if Gold becomes unavailable |

The important architectural point is that GoldDR is not cold standby. The workloads are already deployed and running.

## What Happens When Gold Is Unavailable

When Gold becomes unavailable, **GSLB automatically routes user traffic to the available site**, which is GoldDR.

There is no separate manual application cutover required for eligible workflows. In practical terms:

1. Gold becomes unreachable or unhealthy.
2. GSLB shifts DNS-level routing to GoldDR.
3. Users reach the already-running GoldDR n8n instance.
4. Only workflows that are safe on DR continue operating normally.

This matches the ISA's continuity posture: GoldDR is live, traffic routing is automatic, and the service remains partially available based on workflow type.

## What Users Experience On GoldDR

During failover, the platform is intentionally selective about what remains writable or executable.

| Capability                               | DR behavior               | Why                                                 |
| ---------------------------------------- | ------------------------- | --------------------------------------------------- |
| n8n UI, API, workers                     | Running                   | GoldDR is warm standby                              |
| Non-trigger, non-WIL workflows           | Available                 | Safe to continue on DR                              |
| Trigger-based workflows                  | Disabled                  | Prevents duplicate firing and divergence            |
| WIL and other inbound write integrations | Read-only / maintenance   | Prevents DR-only writes from becoming authoritative |
| Workflow edits and credential changes    | Operationally discouraged | DR-side data is not carried back to Gold            |

The shortest accurate summary is:

- users can be routed to GoldDR automatically
- safe workflows continue
- trigger-driven and external-write patterns are intentionally constrained

## Why Trigger Nodes And WIL Are Restricted On DR

Gold is the system of record. GoldDR is a recoverability target, not a peer-authoritative active-active site.

That creates a one-way data model:

- Gold data is backed up and restored into GoldDR
- data created only on DR is provisional
- when service returns to Gold, DR-only data is overwritten

Because of that:

- trigger nodes are disabled on DR in current Helm overlays using `n8n.extraExcludedNodes`
- selected DR overlays enable `pgo.conditionalRestore` to restore from S3-backed backups
- `dns-probe` is used in some DR environments to support failover-aware restore behavior

For the underlying backup and restore pipeline, see [Database Backup Process](./database-backup-process.md).

If a trigger or inbound integration created side effects while running on DR, those side effects would persist in external systems even though the related DR execution records could later disappear during failback. The ISA treats that divergence as unacceptable.

## How This Shows Up In Helm

The failover posture is expressed directly in Helm overlays.

Examples in `helm/main` include:

- `values-*-golddr.yaml` overlays pointing routes and base URLs at `apps.golddr.devops.gov.bc.ca`
- `n8n.extraExcludedNodes` disabling trigger-style nodes on DR
- `backup-storage.enabled: false` on DR overlays because backups are created on Gold
- `pgo.conditionalRestore.enabled` on selected DR overlays
- `dns-probe.enabled` on selected DR overlays to support conditional restore logic

So the Gold/GoldDR distinction is not just operational policy. It is encoded in deployment configuration.

## How User Traffic Reaches DR

At the service level, user routing is handled by **GSLB**, not by a GitHub Actions workflow and not by Helm itself.

That means:

- CI/CD deploys and keeps both Gold and GoldDR environments current
- OpenShift exposes each environment through its own routes
- GSLB decides which site receives user traffic when one site is unavailable

In other words, CI/CD prepares both sites; platform traffic management decides which one is live for users.

## Failback Behavior

When Gold becomes available again, GSLB can route traffic back to Gold automatically.

The critical constraint is that **DR-only data does not flow back**. The ISA is explicit on this point:

- Gold remains authoritative
- GoldDR is refreshed from Gold
- data created only on DR during the outage window is overwritten on return to Gold

Teams should therefore assume that execution history or edits made only on DR are temporary.

## Design Guidance For Tenant Teams

If a tenant wants the higher continuity profile through Gold-tier failover, their workflows should avoid depending on:

- trigger-based activation patterns
- WIL-based inbound write paths
- assumptions that DR-side edits or execution records will persist after failback

If a workflow depends on those patterns, it should be planned against the Gold baseline availability rather than the higher failover-eligible tier described in the ISA.
