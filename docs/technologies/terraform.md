---
title: Terraform
sidebar_label: Terraform
sidebar_position: 8
---

# Terraform

We use `Terraform` as infrastructure-as-code for provisioning selected platform resources that live outside the main Helm deployment path.

Current repository examples include:

- Sysdig dashboards and alerts under `terraform/sysdig`
- OpenShift or service-account related infrastructure where Terraform is the better control plane than Helm

For the current Sysdig implementation, see [Sysdig](./sysdig.md).
