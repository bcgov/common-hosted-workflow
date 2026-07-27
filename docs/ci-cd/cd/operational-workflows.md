---
title: Operational Workflows
sidebar_label: Operational Workflows
sidebar_position: 3
---

# Operational Workflows

Not every GitHub Action in this repository is part of the main application promotion path. Several workflows support the wider operating model.

## Supporting Delivery Workflows

| Workflow                    | Purpose                                                       | Trigger                                |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `deploy-docs.yml`           | Builds the Docusaurus site and publishes it to `gh-pages`     | `main` push on docs changes, or manual |
| `release-tag-changelog.yml` | Creates a release tag and changelog from conventional commits | Manual                                 |
| `deploy-tools.yml`          | Deploys the tools namespace Helm chart                        | `main` push                            |
| `sysdig-terraform.yml`      | Plans or applies Sysdig Terraform changes                     | PR, `main` push, or manual             |
| `zap-scan.yml`              | Runs an OWASP ZAP full scan against selected URLs             | Manual                                 |

## Why They Matter

These workflows represent platform operations that sit adjacent to the main delivery lane:

- **Documentation delivery** ensures operating and product guidance stays publishable.
- **Release automation** creates a controlled versioning boundary for test and prod promotion.
- **Tools deployment** maintains shared platform services used by application environments.
- **Terraform operations** manage security and monitoring configuration outside the Helm charts.
- **Security scanning** provides on-demand dynamic assessment of deployed endpoints.

Architecturally, this means CI/CD for the repository is broader than application rollout alone. It also includes documentation, infrastructure, shared services, and security operations.
