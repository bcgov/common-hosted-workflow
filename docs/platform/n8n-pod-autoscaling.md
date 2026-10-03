---
title: n8n Pod Autoscaling
sidebar_label: n8n Pod Autoscaling
sidebar_position: 5
---

# n8n Pod Autoscaling

n8n runs as four separate pod types — `main`, `worker`, `webhook`, and `runner` — and each can run more than one replica for additional capacity or availability. This page explains how many replicas run where, how that's controlled, and how to change it.

## Two Different Mechanisms, Because Gold And GoldDR Are Different

Gold and GoldDR scale in different ways, because they play different roles.

| Site   | How replica count is decided                                              |
| ------ | ------------------------------------------------------------------------- |
| Gold   | A fixed number, or automatic scaling based on load                        |
| GoldDR | Driven by whether GoldDR is currently standby or actively serving traffic |

Gold scales the normal way: either a pod type runs a fixed count, or it automatically adds/removes pods based on load.

GoldDR is different because it's usually idle, warm standby. There's no meaningful load signal to scale on most of the time — instead, GoldDR watches the same DNS-based failover signal used elsewhere on DR (see [Gold/GoldDR Failover](./gold-dr-failover.md)) and scales itself up once DNS routing has switched to GoldDR and remained stable, then back down once DNS routing has switched back to Gold.

## How Gold Is Configured

Each pod type on Gold can be given a fixed replica count, or turned over to automatic scaling with a minimum and maximum.

Today, every Gold environment runs each of the four pod types at a single replica, with automatic scaling turned off. This is a deliberate, temporary choice — the platform doesn't yet have real usage data to justify running more, and it's simple to change once that data exists.

To change it, edit the environment's Gold overlay file (e.g. `values-c89a45-prod-gold.yaml`) and either:

- set a fixed number of replicas for that pod type, or
- turn automatic scaling back on with a minimum and maximum

For example, to run `worker` at a fixed 3 replicas:

```yaml
worker:
  enabled: true
  replicaCount: 3
```

Or to let `worker` scale automatically between 3 and 6 replicas based on load instead:

```yaml
worker:
  enabled: true
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 6
```

No template changes are needed — the autoscaling capability is already part of the platform, it's just switched off today.

## How GoldDR Is Configured

GoldDR doesn't use a fixed number or automatic load-based scaling. Instead, each pod type has two numbers:

| Setting   | Meaning                                                                           |
| --------- | --------------------------------------------------------------------------------- |
| `standby` | How many replicas run while Gold is the active site and GoldDR is idle            |
| `active`  | How many replicas run once DNS routing has switched to GoldDR and remained stable |

A scheduled job checks the DNS failover signal every few minutes. Once DNS routing has switched to GoldDR and remained stable for a configurable stabilization period (not just a brief blip), it scales each pod type up to its `active` count. Once DNS routing has switched back to Gold and remained stable for its own stabilization period, GoldDR scales back down to `standby`.

Today, every environment's `standby` and `active` numbers are both set to `1` — the same "no evidence yet to run more" reasoning as Gold above. Changing either number is a values-only change; nothing else needs to be touched, and the change takes effect on the job's next scheduled run.

## Only One Thing Controls Replica Count At A Time

For a given pod type, only one mechanism is ever allowed to decide its replica count — never two at once. A pod type is either:

- controlled the normal Gold way (a fixed number, or automatic scaling), or
- controlled by the GoldDR scaler,

but never both. This isn't automatically enforced by Helm — turning both on for the same pod type would leave two systems quietly fighting over the number, and it's on whoever edits the values files to not do that. The values files carry comments at each relevant switch (Gold's `autoscaling.enabled`, GoldDR's `global.n8nReplicaScalerEnabled`) calling this out.

In everyday use this isn't something you need to think about — Gold and GoldDR are already configured in separate overlay files, so the two mechanisms never overlap unless someone edits both together.

## Why `N8N_MULTI_MAIN_SETUP_ENABLED` Must Be True

The `main` pod type is different from `worker`/`webhook`/`runner`. It's the one that runs the editor UI, the API, and registers webhooks — and running more than one copy of it safely requires n8n's built-in "multi-main" mode, which coordinates the `main` pods through a shared leader-election mechanism instead of letting them step on each other.

Without multi-main mode turned on, running two or more `main` pods at once is not a supported way to provide main-instance HA.

This setting is turned on everywhere already, even though every environment currently runs `main` at a single replica. That's intentional: it means the platform is ready to run more than one `main` pod the moment it's needed, without a separate rollout to enable multi-main mode first. With only one `main` pod running, the setting has no effect — there's nothing to coordinate yet.

Before `main` is actually scaled past one replica in production, two things should be confirmed first:

- the n8n Enterprise license covers multi-main mode for that environment
- a real failover test has been run — not just that a backup `main` pod can take over, but how an in-progress workflow execution behaves when the active `main` pod fails

## Where To Look In Code

Primary sources for the current implementation:

- `helm/_n8n/templates/autoscaling/{main,worker,webhook,runner}.yaml` — Gold's autoscaling
- `helm/_n8n/templates/deployments/{main,worker,webhook,runner}.yaml` — replica count ownership
- `helm/_pgo/templates/n8n-replica-scaler/` — the GoldDR scaling job
- `helm/_pgo/values.yaml` — GoldDR's `standby`/`active` replica counts and timing
- `helm/main/values-c89a45-*-gold.yaml` — Gold's per-environment replica settings
- `helm/main/values-c89a45-*-golddr.yaml` — GoldDR enablement and `N8N_MULTI_MAIN_SETUP_ENABLED`
