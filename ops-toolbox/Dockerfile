# Small, generic Kubernetes/OpenShift ops-toolbox image: bash, curl, jq,
# helm, make, oc, gzip, tar, and the PostgreSQL client (psql). Shared across CronJobs/Jobs in this repo that need a
# lightweight shell environment with these CLIs — add new tools here rather
# than duplicating a similar image elsewhere. No application-specific logic
# or scripts are baked in; scripts are supplied by the Helm chart or Job
# that uses this image.

# Images are pinned by digest only, for reproducible builds.
# Versions at time of pinning: helm 4.2.0, origin-cli 4.22, UBI 9.8,
# PostgreSQL client 17 (PGDG).

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

# PostgreSQL client major version. Keep it in step with the PostgreSQL
# servers (bump when the clusters are upgraded).
ARG PG_MAJOR=17

ADD --checksum=sha256:a15b05a745c6a94637522113863f95690576316195ce29d925e494028663c9fd \
    https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-42.0-70.rhel9PGDG.noarch.rpm \
    /tmp/pgdg.rpm

RUN rpm -i /tmp/pgdg.rpm \
    && rm -f /tmp/pgdg.rpm \
    && microdnf install -y --setopt=install_weak_deps=0 \
        jq \
        make \
        shadow-utils \
        gzip \
        tar \
        "postgresql${PG_MAJOR}" \
    && microdnf clean all \
    && ln -s "/usr/pgsql-${PG_MAJOR}/bin/psql" /usr/local/bin/psql \
    # Verify all required tools are available during the build.
    && bash --version \
    && curl --version \
    && jq --version \
    && helm version \
    && make --version \
    && oc version --client \
    && gunzip --version \
    && tar --version \
    && psql --version \
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
