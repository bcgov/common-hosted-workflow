FROM node:24.16.0-alpine3.23 AS build-nodes

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@11.0.8

WORKDIR /app

COPY community-nodes/package.json community-nodes/pnpm-lock.yaml community-nodes/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY community-nodes .
RUN pnpm build

FROM node:24.16.0-alpine3.23 AS build-hooks

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@11.0.8

WORKDIR /app

COPY external-hooks/package.json external-hooks/pnpm-lock.yaml external-hooks/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY external-hooks .
RUN pnpm bundle

FROM node:24.16.0-alpine3.23 AS build-ui

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@11.0.8

WORKDIR /app

COPY external-ui/package.json external-ui/pnpm-lock.yaml external-ui/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY external-ui .
RUN pnpm build

FROM n8nio/n8n:2.27.2

WORKDIR /home/node

COPY --from=build-nodes /app/dist /community-nodes/dist
COPY --from=build-nodes /app/package.json /community-nodes/package.json
COPY --from=build-hooks /app/dist /external-hooks
COPY --from=build-hooks /app/src/api/assets /external-hooks/api/assets
COPY --from=build-ui /app/dist /external-ui/dist
COPY external-hooks/drizzle /external-hooks/drizzle

# Keep Swagger UI disabled by default. Enable per environment.
ENV N8N_PORT=5678 \
    ENABLE_SWAGGER_UI=false \
    N8N_TRUST_PROXY=true \
    N8N_PROXY_HOPS=1 \
    N8N_PROTOCOL="https" \
    N8N_COMMUNITY_PACKAGES_ENABLED=true \
    N8N_CUSTOM_EXTENSIONS="/home/node/.n8n/nodes" \
    N8N_ADDITIONAL_NON_UI_ROUTES="ui:assets" \
    EXTERNAL_HOOK_FILES=/external-hooks/api/hooks.cjs \
    EXTERNAL_HOOK_ASSETS_PATH=/external-hooks/api/assets \
    EXTERNAL_FRONTEND_HOOKS_URLS=/assets/oidc-frontend-hook.js \
    EXTERNAL_UI_PATH=/external-ui/dist \
    SSO_RESTRICT_NO_ROLE=true
