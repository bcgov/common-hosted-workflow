FROM node:22.22.0-alpine3.23 AS build-nodes

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@latest

WORKDIR /app

COPY community-nodes/package.json community-nodes/pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile

COPY community-nodes .
RUN pnpm build

FROM node:22.22.0-alpine3.23 AS build-hooks

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@latest

WORKDIR /app

COPY external-hooks/package.json external-hooks/pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile

COPY external-hooks .
RUN pnpm bundle

FROM n8nio/n8n:2.5.2

WORKDIR /home/node

COPY external-hooks /external-hooks/
COPY --from=build-nodes /app/dist /community-nodes/dist
COPY --from=build-nodes /app/package.json /community-nodes/package.json
COPY --from=build-hooks /app/dist /external-hooks

ENV N8N_PORT=5678 \
    N8N_TRUST_PROXY=true \
    N8N_PROXY_HOPS=1 \
    N8N_PROTOCOL="https" \
    N8N_COMMUNITY_PACKAGES_ENABLED=true \
    N8N_CUSTOM_EXTENSIONS="/home/node/.n8n/nodes" \
    EXTERNAL_HOOK_FILES=/external-hooks/oidc.cjs:/external-hooks/test.cjs \
    EXTERNAL_FRONTEND_HOOKS_URLS=/assets/oidc-frontend-hook.js
