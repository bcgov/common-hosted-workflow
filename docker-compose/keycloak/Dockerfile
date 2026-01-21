# ===== Stage 1: Build mkcert and generate localhost cert =====
FROM golang:1.24.6-bullseye AS Build
WORKDIR /opt

# Install git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone mkcert and build
RUN git clone https://github.com/FiloSottile/mkcert.git \
    && cd mkcert \
    && go build -ldflags "-X main.Version=$(git describe --tags)"

# Generate certs for localhost
WORKDIR /opt/mkcert
RUN ./mkcert localhost \
    && chmod 644 localhost.pem \
    && chmod 644 localhost-key.pem

# ===== Stage 2: Keycloak with TLS certs =====
FROM quay.io/keycloak/keycloak:26.4.7

# Copy certs from build stage
COPY --from=build /opt/mkcert/localhost.pem /opt/keycloak/conf/server.crt.pem
COPY --from=build /opt/mkcert/localhost-key.pem /opt/keycloak/conf/server.key.pem

# Set working directory
WORKDIR /opt/keycloak/bin

# Environment variables to tell Keycloak to use the certs
ENV KC_HTTPS_CERTIFICATE_FILE=/opt/keycloak/conf/server.crt.pem \
    KC_HTTPS_CERTIFICATE_KEY_FILE=/opt/keycloak/conf/server.key.pem \
    KC_HOSTNAME=localhost \
    KC_HTTPS_PORT=8443

# Expose HTTPS port
EXPOSE 8443

# Start Keycloak with HTTPS enabled
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized"]
