# Sandbox Environment Guide

The development sandbox provides an isolated local environment for development and testing. It uses Docker to mock the live system, granting you full control over local data and interfaces.

## Pre-requisites

Depending on your organization's procurement policies (e.g., BC Government restrictions), choose one of the following container engines:

### 1. Choose Your Container Engine

- **Standard:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Requires WSL2 on Windows).
- **Policy-Compliant Alternatives:** - **Podman** (Recommended for Mac/Linux)
- **Rancher Desktop**
- **Docker Engine** (Linux native)

### 2. Manual CLI Setup (Non-Docker Desktop Users)

If you are using the Docker CLI without the Desktop GUI, ensure your environment is linked:

| OS        | Installation / Setup Command                            |
| --------- | ------------------------------------------------------- |
| **macOS** | `brew install docker docker-compose docker-buildx` <br> |

<br>

<br> `mkdir -p ~/.docker/cli-plugins` <br>

<br> `ln -s $HOMEBREW_PREFIX/lib/docker/cli-plugins/docker-compose ~/.docker/cli-plugins/docker-compose` |
| **Windows** | Follow the [WSL2 + Native Docker Guide](https://gist.github.com/martinsam16/4492957e3bbea34046f2c8b49c3e5ac0) |

## Getting Started

### Spin Up the Sandbox

Launch the environment. The setup includes automated provisioning for Keycloak and n8n custom nodes and external endpoints.

In `docker-compose` directory, run:

```bash
docker compose --env-file .env.example up --build

```

## Service Catalog

Once the containers are healthy, the following services are available:

| Service      | Description                  | Local Access                                                                   |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------ |
| **Keycloak** | Identity & Access Management | [http://localhost:8080](https://www.google.com/search?q=http://localhost:8080) |
| **n8n**      | Workflow Automation          | [http://localhost:5678](https://www.google.com/search?q=http://localhost:5678) |
| **Postgres** | Primary DB (v18.0)           | `localhost:5432`                                                               |

## Automated Provisioning Details

The sandbox uses a "Dependency Chain" to ensure services configure themselves in the correct order:

1. **Postgres (`initdb`)**: Creates the initial schemas. **Note:** Ensure your `./initdb` folder contains a script to create the `keycloak` database, as Postgres only creates the one defined in `POSTGRES_DB` by default.
2. **Keycloak Provisioning**: The `keycloak-provision` service uses the Keycloak Admin CLI or API to create the `starter` realm and the OIDC client.
3. **n8n Provisioning**:

- **Idempotency**: Checks if workflows exist before importing to avoid duplicates.
- **Custom Nodes**: Injects community nodes into the `/home/node/.n8n/nodes` directory.
- **Hooks**: Runs `migrate.cjs` to set up external hooks (e.g., custom logging or auditing).

## 💾 Persistence & Volumes

Data is persisted across restarts using named Docker volumes. If you need to **wipe the environment**, run `docker-compose down -v`.

- `n8n_storage`: Stores the `.n8n` folder, including SQLite (if used), binary data, and installed nodes.
- `postgres_storage`: Stores the physical database files for both n8n and Keycloak.
