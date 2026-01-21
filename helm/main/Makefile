SHELL := /usr/bin/env bash

NAME := chwf
NAMESPACE =
IMAGE_TAG =

ifndef NAMESPACE
    $(error NAMESPACE is not set)
endif

define arguments
    "${NAME}" . \
    -n "${NAMESPACE}" \
    -f values.yaml \
    -f "values-${NAMESPACE}.yaml" \
	--set n8n.image.tag="${IMAGE_TAG}"
endef

.PHONY: helm-dep install upgrade lint uninstall template force-install help

helm-dep:
	helm dependency update

install: helm-dep
	@helm install $(call arguments)

upgrade: helm-dep
	@helm upgrade --install $(call arguments)

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
	@echo "  lint           Dry-run install for validation"
	@echo "  uninstall      Remove the release"
	@echo "  template       Render template to file"
	@echo "  force-install  Uninstall then install"
