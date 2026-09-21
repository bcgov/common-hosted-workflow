ARG N8N_SYNC_VERSION=0.21.0

FROM node:24.19.0-alpine3.23 AS build-nodes

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY community-nodes/package.json community-nodes/pnpm-lock.yaml community-nodes/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY community-nodes .
RUN pnpm build

FROM node:24.19.0-alpine3.23 AS build-hooks

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY external-hooks/package.json external-hooks/pnpm-lock.yaml external-hooks/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY external-hooks .
RUN pnpm bundle

FROM node:24.19.0-alpine3.23 AS build-ui

RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY external-ui/package.json external-ui/pnpm-lock.yaml external-ui/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY external-ui .
RUN pnpm build

# Download @egose/n8n-sync from npm and extract the hook bundles.
# Override with --build-arg N8N_SYNC_VERSION=<version>.
FROM node:22-alpine AS build-n8n-sync
ARG N8N_SYNC_VERSION

WORKDIR /tmp
# NOTE: the published layout is package/publisher.cjs + package/subscriber.cjs;
# older example revisions used package/dist/*.cjs. Handle both.
RUN set -eux; \
    npm pack "@egose/n8n-sync@${N8N_SYNC_VERSION}" --pack-destination /tmp; \
    tarball="$(ls egose-n8n-sync-*.tgz)"; \
    tar -xzf "${tarball}"; \
    mkdir -p /bundles; \
    if [ -f package/dist/publisher.cjs ]; then \
      cp package/dist/publisher.cjs package/dist/subscriber.cjs /bundles/; \
    else \
      cp package/publisher.cjs package/subscriber.cjs /bundles/; \
    fi; \
    ls -l /bundles/

FROM n8nio/n8n:2.36.2

WORKDIR /home/node

COPY --from=build-nodes /app/dist /community-nodes/dist
COPY --from=build-nodes /app/package.json /community-nodes/package.json
COPY --from=build-nodes /app/pnpm-lock.yaml /community-nodes/pnpm-lock.yaml
COPY --from=build-nodes /app/pnpm-workspace.yaml /community-nodes/pnpm-workspace.yaml
COPY --from=build-hooks /app/dist /external-hooks
COPY --from=build-hooks /app/package.json /external-hooks/package.json
COPY --from=build-hooks /app/pnpm-lock.yaml /external-hooks/pnpm-lock.yaml
COPY --from=build-hooks /app/pnpm-workspace.yaml /external-hooks/pnpm-workspace.yaml
COPY --from=build-hooks /app/src/api/assets /external-hooks/api/assets
COPY --from=build-ui /app/dist /external-ui/dist
COPY external-hooks/drizzle /external-hooks/drizzle
COPY --from=build-n8n-sync /bundles/ /opt/n8n-hooks/

USER root
RUN npm install -g pnpm@11.17.0
RUN cd /community-nodes && pnpm install --frozen-lockfile --prod
RUN cd /external-hooks && pnpm install --frozen-lockfile --prod
USER node

# Keep Swagger UI disabled by default. Enable per environment.
# Select the n8n-sync role for this container (override at runtime as needed):
#   publisher:  /external-hooks/api/hooks.cjs:/opt/n8n-hooks/publisher.cjs
#   subscriber: /external-hooks/api/hooks.cjs:/opt/n8n-hooks/subscriber.cjs
#   both:       /external-hooks/api/hooks.cjs:/opt/n8n-hooks/publisher.cjs:/opt/n8n-hooks/subscriber.cjs
# Publisher also needs SYNC_SUBSCRIBER_URLS, SYNC_SOURCE_ID, SYNC_SHARED_SECRET.
# Subscriber needs SYNC_SHARED_SECRET.
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
