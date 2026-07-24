---
title: Secret Scanning
sidebar_label: Secret Scanning
sidebar_position: 3
---

# Secret Scanning

To prevent sensitive data such as API keys, passwords, and tokens from entering the repository, we use [detect-secrets](https://github.com/Yelp/detect-secrets) through the shared `pre-commit` policy.

This means secret scanning happens in two places:

- before commit on a developer workstation
- again in GitHub Actions through the pre-commit workflows

If a candidate secret is detected, the commit or workflow will fail until the issue is resolved.

## Operating Model

The repository uses a baseline file, `.secrets.baseline`, to distinguish accepted false positives from real findings. This keeps scanning actionable without forcing developers to re-triage known noise on every run.

## Creating or Updating the Baseline

If you intentionally introduce a value that looks secret-like, such as fixed mock data for tests, or if the baseline needs to be regenerated, update `.secrets.baseline` from the repository root:

Run the following command from the root directory:

```sh
detect-secrets scan --exclude-files '(docker-compose/n8n/demo-data/|pnpm-lock\.yaml|.*/pnpm-lock\.yaml)$' > .secrets.baseline

```

## Notes

- **Prefer removal over suppression:** if the scanner catches a real credential, remove or rotate it. Do not normalize it into the baseline.
- **Use the baseline sparingly:** add only reviewed false positives or intentionally fake values.
- **Respect noisy-file exclusions:** the provided command excludes lockfiles and demo data to keep scans fast and useful.
- **Treat baseline changes as security-sensitive:** reviewers should inspect them with the same care as credential-handling code.
