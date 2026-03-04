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

---

## Getting Started

### 1. Environment Configuration

Ensure you have a `.env` file in the root directory with the following variables defined (referencing the Compose file):

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`
- `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`
- `N8N_ENCRYPTION_KEY`, `N8N_USER_MANAGEMENT_JWT_SECRET`

### 2. Spin Up the Sandbox

Launch the environment. The setup includes automated provisioning for Keycloak and n8n demo data.

```bash
docker-compose up --build -d

```

## ⚙️ Service Catalog

Once the containers are healthy, the following services are available:

| Service      | Description                                   | Local Access                                                                   |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| **Keycloak** | Identity & Access Management (Custom Build)   | [http://localhost:8080](https://www.google.com/search?q=http://localhost:8080) |
| **n8n**      | Workflow Automation (with OIDC & AI enabled)  | [http://localhost:5678](https://www.google.com/search?q=http://localhost:5678) |
| **Postgres** | Primary DB (v18.0) - Shared by n8n & Keycloak | `localhost:5432`                                                               |
| **Qdrant**   | Vector Database for AI/RAG                    | [http://localhost:6333](https://www.google.com/search?q=http://localhost:6333) |
| **Ollama**   | Local LLM Runner (Optional/Commented Out)     | `localhost:11434`                                                              |

---

## 🛠️ Automated Provisioning

The sandbox includes "Run-Once" containers that handle the heavy lifting of environment setup:

- **`keycloak-provision`**: Automatically configures the `starter` realm and OIDC clients after Keycloak starts.
- **`n8n-import`**:
- Checks if workflows exist; if not, imports credentials and workflows from `./n8n/demo-data`.
- Installs community nodes from `../community-nodes`.

- **`initdb`**: The Postgres service automatically executes scripts located in `./initdb` on first boot.

## 💾 Persistence & Volumes

Data is persisted across restarts using named Docker volumes:

- `n8n_storage`: Config, nodes, and local binary data.
- `postgres_storage`: All relational data (n8n & Keycloak tables).
- `qdrant_storage`: Vector collections and indexes.
- `ollama_storage`: Downloaded LLM models (e.g., Llama 3.2).

> **Note on AI Features:** Ollama is currently commented out in the `docker-compose.yaml`. To use local AI nodes in n8n, uncomment the `ollama` and `ollama-pull-llama` services.
