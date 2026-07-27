---
title: OpenShift
sidebar_label: OpenShift
sidebar_position: 2
---

# OpenShift

OpenShift is the primary runtime platform for this repository.

This project is not deployed to generic Kubernetes first and adapted later. The delivery model, routing model, security model, and DR topology are all designed around BC Gov OpenShift.

## Why This Project Uses OpenShift

OpenShift provides the platform layer for:

- namespace-scoped application isolation
- route-based ingress exposure
- deployment and rollout management
- network policy enforcement
- Gold and GoldDR cluster hosting

At a platform level, OpenShift is the substrate on which the workflow service runs. GitHub Actions, Helm, and Terraform all target it.

## How This Repository Uses It

OpenShift shows up across the repo in several concrete ways:

- GitHub Actions deploy with `oc-login` and target OpenShift namespaces
- Helm charts render OpenShift `Route` resources
- network controls rely on namespace-aware `NetworkPolicy`
- Terraform uses Kubernetes/OpenShift-backed state for some infrastructure workflows
- platform continuity is defined around Gold and GoldDR OpenShift clusters

## Runtime Responsibilities

In deployed environments, OpenShift hosts:

- n8n runtime pods
- PostgreSQL clusters managed through Crunchy PGO
- Redis
- backup and restore jobs
- supporting components such as DNS probe and optional observability services

## OpenShift-Specific Features In This Repo

Examples of explicitly OpenShift-aware implementation include:

- `route.openshift.io/v1` `Route` manifests in the local Helm charts
- `oc` usage in Helm Makefile targets
- GitHub Actions authentication through `redhat-actions/oc-login`
- namespace and cluster targeting through GitHub Environment variables

## Operational Model

The production hosting model assumes:

- **Gold** as the active primary cluster
- **GoldDR** as the warm standby cluster
- GSLB as the traffic steering mechanism between sites

That continuity model is part of the platform design, not an application add-on.

For the broader hosting and failover model, see:

- [High-Level Architecture](../platform/high-level-architecture.md)
- [Gold/GoldDR Failover](../platform/gold-dr-failover.md)

## Key Source Files

- `.github/workflows/_deploy.yml`
- `helm/_n8n/templates/route.yaml`
- `helm/main/templates/networkpolicy.yaml`
- `terraform/openshift-deployer/README.md`
