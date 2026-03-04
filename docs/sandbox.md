## Local Sandbox: Full Setup Guide

Follow these steps to configure your local environment, build custom extensions, and migrate the database.

### 1. Build Community Nodes

Before launching the stack, you must compile the custom extensions n8n will load.

- **Directory:** `community-nodes`
- **Commands:**

```bash
pnpm install
pnpm build

```

### 2. Configure Environment Variables

Initialize your environment settings by cloning the template.

- **Action:** In the `docker-compose` directory, copy `.env.example` to a new file named `.env`.

### 3. Selective Database Migration

To run migrations, we spin up the PostgreSQL container individually so the migration script can access it via `localhost`.

**Step A: Start Postgres**
Navigate to the `docker-compose` directory and run:

```bash
docker compose up postgres

```

**Step B: Execute Migration**
In another terminal, navigate to the `external-hooks` directory and run:

```bash
pnpm install
pnpm bundle
cp -r drizzle dist/

# Run the migration script against the local container
CUSTOM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/n8n_custom node dist/migrate.cjs # pragma: allowlist secret

```

### 4. Launch the Full Stack

Once the database is migrated and nodes are built, you can initialize the entire environment.

> If you have an existing Postgres service running in the other terminal, please exist first.

- **Directory:** `docker-compose`
- **Command:**

```bash
docker compose up --build

```
