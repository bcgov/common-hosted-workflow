# CI Pipeline Checks

To maintain high code quality and streamline the peer review process, we use a two-tiered Continuous Integration (CI) strategy. These checks ensure that all contributions are linted, formatted, and secure before they reach your colleagues.

## 1. Pre-commit Hooks (Local & CI)

We use the [pre-commit framework](https://pre-commit.com/) to catch issues early. These checks are defined in [`.pre-commit-config.yaml`](../../../.pre-commit-config.yaml) and run in two stages:

- **Local Development:** Hooks run automatically before every commit to ensure your staged changes meet quality and security standards.
- **CI Enforcement:** The same checks are mirrored in our GitHub Actions pipeline to prevent substandard code from entering the repository.

> **Resource:** For implementation details, see the [`pre-commit.yml`](../../../.github/workflows/pre-commit.yml) workflow file.
