# Secret Scanning

To prevent sensitive data (like API keys or passwords) from being committed to the repository, we use a **pre-commit hook** powered by [detect-secrets](https://github.com/Yelp/detect-secrets).

This tool scans your changes before every commit. If it flags a potential secret, the commit will be blocked until the issue is resolved.

## Creating or Updating the Baseline

If you have introduced new, intentional "secrets" (like mock data for tests) or need to initialize the tool for the first time, you must update the `.secrets.baseline` file. This file tells the scanner which existing strings are safe to ignore.

Run the following command from the root directory:

```sh
detect-secrets scan --exclude-files '(docker-compose/n8n/demo-data/|pnpm-lock\.yaml|.*/pnpm-lock\.yaml)$' > .secrets.baseline

```

## Notes

- **Audit your baseline:** After generating a baseline, review it. If a real secret is caught, **remove the secret from the code** rather than adding it to the baseline.
- **False Positives:** If the tool flags a non-secret (like a long UUID), you can mark it as a false positive in the baseline file so it doesn't block you again.
- **Excluded Files:** The command above automatically ignores noisy files like `pnpm-lock.yaml` and demo data folders to keep the scan fast and relevant.
