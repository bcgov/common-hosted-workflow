# Small image for the n8n replica-scaler CronJob.
# UBI 9 minimal provides bash and curl; jq parses the probe response,
# and oc reads and scales n8n Deployments. The scaler script is mounted
# by the Helm chart, so it is not included in this image.

# Pin the base images by digest for reproducible builds.
# Update the digests when intentionally upgrading the base images.
FROM quay.io/openshift/origin-cli@sha256:2720e98c9d04bb1b191c1dcac9fea8bff40c1701dd91f721101f4f4fb43576e0 AS oc

FROM registry.access.redhat.com/ubi9/ubi-minimal@sha256:8ebe2ad8fdf3cab3e5a53c1edc69194c98209cfadab24b884f4ad9ebcf7bbbfc

COPY --from=oc /usr/bin/oc /usr/bin/oc

RUN microdnf install -y jq && microdnf clean all \
    # Verify all required tools are available during the build.
    && bash --version && curl --version && jq --version && oc version --client \
    && groupadd -r scaler && useradd -r -g scaler scaler

# OpenShift's default SCC would enforce a non-root UID anyway, but setting
# this explicitly keeps the image non-root outside OpenShift too.
USER scaler
