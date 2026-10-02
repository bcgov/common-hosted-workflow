# Small, generic Kubernetes/OpenShift ops-toolbox image: bash, curl, jq,
# helm, make, and oc. Shared across CronJobs/Jobs in this repo that need a
# lightweight shell environment with these CLIs — add new tools here rather
# than duplicating a similar image elsewhere. No application-specific logic
# or scripts are baked in; scripts are supplied by the Helm chart or Job
# that uses this image.

# Images are pinned by digest only, for reproducible builds.
# Versions at time of pinning: helm 4.2.0, origin-cli 4.22, UBI 9.8.

# Helm and oc are supplied as upstream CLI binaries rather than installed
# from the UBI repositories; jq and make are installed from UBI packages.
# Helm is copied as a standalone binary from the Alpine-based Helm image;
# the Alpine userspace is not included in the final UBI-based image.
# Copy only the oc client binary from the OpenShift CLI image; the final
# runtime remains UBI 9.
FROM alpine/helm@sha256:af08f75a3130d666a50b9fc150f40987ef20b885cf67659aabf4b83a5f2c5501 AS helm
FROM quay.io/openshift/origin-cli@sha256:64ecbe0b472c5a311ce0a5f1606fdac1842aeaf1523c69e02ff7d15cf43cb5b9 AS oc

FROM registry.access.redhat.com/ubi9/ubi-minimal@sha256:8ebe2ad8fdf3cab3e5a53c1edc69194c98209cfadab24b884f4ad9ebcf7bbbfc

COPY --from=helm /usr/bin/helm /usr/local/bin/helm
COPY --from=oc /usr/bin/oc /usr/local/bin/oc

RUN microdnf install -y jq make shadow-utils \
    && microdnf clean all \
    # Verify all required tools are available during the build.
    && bash --version \
    && curl --version \
    && jq --version \
    && helm version \
    && make --version \
    && oc version --client \
    # Helm and oc may write configuration/cache data under $HOME.
    # OpenShift can run containers with an arbitrary UID in group 0, so
    # the home directory must be writable by group 0.
    && groupadd -r toolbox \
    && useradd -r -m -d /home/toolbox -g toolbox toolbox \
    && chgrp -R 0 /home/toolbox \
    && chmod -R g=u /home/toolbox

ENV HOME=/home/toolbox

# Run as a non-root user by default outside OpenShift; OpenShift may
# override the UID through its security context constraints.
USER toolbox
