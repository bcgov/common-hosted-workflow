SHELL := /usr/bin/env bash

NAME := chwf
NAMESPACE ?=
IMAGE_TAG ?=
CLUSTER ?=
FAILOVER ?= false
FAILOVER_VALUES :=

ifeq ($(strip $(NAMESPACE)),)
    $(error NAMESPACE is not set)
endif

ifeq ($(strip $(CLUSTER)),)
    $(error CLUSTER is not set, should be one of silver,gold,golddr)
endif

ifeq ($(strip $(FAILOVER)),true)
    ifneq ($(strip $(CLUSTER)),golddr)
        $(error FAILOVER=true is only supported for CLUSTER=golddr, got '$(CLUSTER)')
    endif

    ifeq ($(wildcard values-${NAMESPACE}-${CLUSTER}-failover.yaml),)
        $(error FAILOVER=true but values-${NAMESPACE}-${CLUSTER}-failover.yaml does not exist)
    endif

    FAILOVER_VALUES := -f "values-${NAMESPACE}-${CLUSTER}-failover.yaml"
endif

define arguments
    "${NAME}" . \
    -n "${NAMESPACE}" \
    -f values.yaml \
    -f "values-${NAMESPACE}-${CLUSTER}.yaml" \
    ${FAILOVER_VALUES} \
	--set n8n.image.tag="${IMAGE_TAG}" \
	--set sdg-mock-app.image.tag="${IMAGE_TAG}" \
	--set dns-probe.image.tag="${IMAGE_TAG}"
endef

.PHONY: helm-dep install upgrade failover-upgrade lint uninstall template force-install help delete-successful-jobs

delete-successful-jobs:
	oc delete jobs --field-selector status.successful=1 -n "${NAMESPACE}"

helm-dep:
	helm dependency update

install: helm-dep
	@helm install $(call arguments)

upgrade: helm-dep delete-successful-jobs
	@helm upgrade --install $(call arguments)

# Upgrade-only target used by the DR failover CronJob.
failover-upgrade: helm-dep
	@helm upgrade $(call arguments)

lint: helm-dep
	@helm upgrade --dry-run --install $(call arguments)

uninstall:
	@helm uninstall ${NAME} -n ${NAMESPACE}

template: helm-dep
	@helm template $(call arguments) > template.yaml

force-install: uninstall install

help:
	@echo "Available targets:"
	@echo "  install        Install the Helm chart"
	@echo "  upgrade        Upgrade or install the Helm chart"
	@echo "  failover-upgrade  Upgrade-only (never installs); used by the DR failover CronJob"
	@echo "  lint           Dry-run install for validation"
	@echo "  uninstall      Remove the release"
	@echo "  template       Render template to file"
	@echo "  force-install  Uninstall then install"
