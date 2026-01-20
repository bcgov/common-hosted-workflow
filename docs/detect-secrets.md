## Initial Detect Secrets

```sh
detect-secrets scan --exclude-files '(pnpm-lock\.yaml|.*/pnpm-lock\.yaml)$' > .secrets.baseline
```
