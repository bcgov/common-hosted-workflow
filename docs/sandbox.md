## Local Sandbox: Full Setup Guide

### 1. Build Community Nodes

This prepares the custom extensions that n8n will load.

- **Directory:** `community-nodes`
- **Commands:**

```bash
pnpm install
pnpm build

```

### 2. .env file

Please copy `.env.example` in the directory `docker-compose` to `.env`.

### 3. Selective Database Migration

We will spin up **only** the PostgreSQL container to allow the migration script to run against it via `localhost`.

- **Step A: Start Postgres**
  In the `docker-compose` directory:

```bash
docker compose up -d postgres

```

- **Step B: Run Migration**
  In the `external-hooks` directory:

```bash
pnpm install
pnpm bundle
cp -r drizzle dist/

CUSTOM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/n8n_custom node dist/migrate.cjs # pragma: allowlist secret

```

### 4. Launch the Full Stack

Now that the database is migrated and the nodes are built, bring up the rest of the services.

- **Directory:** `docker-compose`
- **Command:**

```bash
docker compose up --build

```
