FROM n8nio/n8n:2.5.0

WORKDIR /home/node

COPY external-hooks /external-hooks/

ENV N8N_PORT=5678 \
    # N8N_TRUST_PROXY=true \
    # N8N_PROXY_HOPS=1 \
    N8N_COMMUNITY_PACKAGES_ENABLED=true \
    EXTERNAL_HOOK_FILES=/external-hooks/oidc.js \
    EXTERNAL_FRONTEND_HOOKS_URLS=/assets/oidc-frontend-hook.js
