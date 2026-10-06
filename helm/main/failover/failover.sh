#!/bin/bash
set -eo pipefail

# ==============================================================================
# Logging
# ==============================================================================

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# ==============================================================================
# Validate required tools and configuration.
# ==============================================================================

for cmd in curl jq helm make tar; do
  command -v "${cmd}" >/dev/null 2>&1 || {
    log "ERROR: required command '${cmd}' is not available."
    exit 1
  }
done

for var in DNS_PROBE_STATUS_URL RELEASE_NAME NAMESPACE CLUSTER CHART_REPO CHART_REF; do
  [ -n "${!var}" ] || {
    log "ERROR: required environment variable ${var} is not set."
    exit 1
  }
done

if ! [[ "${STABILIZATION_SECONDS}" =~ ^[0-9]+$ ]]; then
  log "ERROR: STABILIZATION_SECONDS is not a valid non-negative integer (got '${STABILIZATION_SECONDS}')."
  exit 1
fi

# ==============================================================================
# DNS probe
# ==============================================================================
#
# Fetch dns-probe's /status and set ROUTING/DURATION.
# Return 1 if the response cannot be trusted.
fetch_probe_status() {
  local HTTP_STATUS CURL_EXIT

  # Capture curl's exit code separately from the HTTP status.
  set +e
  HTTP_STATUS=$(curl -sS --max-time 10 \
    -o /tmp/probe_response.json \
    -w "%{http_code}" \
    "${DNS_PROBE_STATUS_URL}" 2>/dev/null)
  CURL_EXIT=$?
  set -e

  if [ "${CURL_EXIT}" -ne 0 ] || [ "${HTTP_STATUS}" != "200" ]; then
    log "ERROR: DNS probe request failed (curl exit ${CURL_EXIT}, HTTP status ${HTTP_STATUS:-none})."
    return 1
  fi

  ROUTING=$(grep -o '"current_routing": *"[^"]*"' /tmp/probe_response.json | cut -d'"' -f4 || echo "unknown")
  DURATION=$(grep -o '"duration_seconds": *[0-9]*' /tmp/probe_response.json | grep -o '[0-9]*$' || echo "0")
  rm -f /tmp/probe_response.json

  if ! [[ "${DURATION}" =~ ^[0-9]+$ ]]; then
    log "WARNING: duration_seconds is not a valid non-negative integer (got '${DURATION}')."
    return 1
  fi

  return 0
}

# ==============================================================================
# DR routing and stabilization checks
# ==============================================================================

log "Querying DNS probe: ${DNS_PROBE_STATUS_URL}"

if ! fetch_probe_status; then
  log "Could not safely determine DR routing state. No action."
  exit 1
fi

log "current_routing=${ROUTING} duration_seconds=${DURATION}"

case "${ROUTING}" in
  "primary")
    DESIRED_FAILOVER=false
    ;;
  "secondary")
    DESIRED_FAILOVER=true
    ;;
  *)
    log "ERROR: unrecognized routing state: '${ROUTING}'. No action."
    exit 1
    ;;
esac

if [ "${DURATION}" -lt "${STABILIZATION_SECONDS}" ]; then
  log "Routing has only been stable for ${DURATION}s (< ${STABILIZATION_SECONDS}s required). No action until stable."
  exit 0
fi

# ==============================================================================
# Current release state
# ==============================================================================

# Read the currently deployed image tag and failover state.
# If the release already has the desired failover state, no Helm upgrade
# is required.
log "Reading current release state (helm get values ${RELEASE_NAME})..."
if ! RELEASE_VALUES=$(helm get values "${RELEASE_NAME}" -n "${NAMESPACE}" -a -o json); then
  log "ERROR: could not read values for release ${RELEASE_NAME} in ${NAMESPACE}. No action."
  exit 1
fi

IMAGE_TAG=$(jq -er '.n8n.image.tag // empty' <<<"${RELEASE_VALUES}") || {
  log "ERROR: could not determine the current n8n image tag. No action."
  exit 1
}

if ! [[ "${IMAGE_TAG}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  log "ERROR: invalid n8n image tag: '${IMAGE_TAG}'. No action."
  exit 1
fi

APPLIED=$(echo "${RELEASE_VALUES}" | jq -r '.failover.applied // false')
if [ "${APPLIED}" != "true" ] && [ "${APPLIED}" != "false" ]; then
  log "ERROR: unexpected failover.applied value in the release: '${APPLIED}'. No action."
  exit 1
fi

if [ "${APPLIED}" = "${DESIRED_FAILOVER}" ]; then
  log "Release is already in the desired state (failover.applied=${APPLIED}). No action."
  exit 0
fi

# ==============================================================================
# Chart download and dependency setup
# ==============================================================================

# Download the exact chart source used for the Helm upgrade.
WORKDIR=$(mktemp -d)
trap 'rm -rf "${WORKDIR}"' EXIT

CHART_URL="https://github.com/${CHART_REPO}/archive/${CHART_REF}.tar.gz"
log "Downloading chart source: ${CHART_URL}"

if ! curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 --max-time 120 \
  -o "${WORKDIR}/chart.tar.gz" "${CHART_URL}"; then
  log "ERROR: could not download the chart source. No changes made."
  exit 1
fi

mkdir "${WORKDIR}/src"
if ! tar -xzf "${WORKDIR}/chart.tar.gz" -C "${WORKDIR}/src" --strip-components=1; then
  log "ERROR: could not extract the chart source. No changes made."
  exit 1
fi

CHART_DIR="${WORKDIR}/src/helm/main"
if [ ! -f "${CHART_DIR}/Makefile" ]; then
  log "ERROR: ${CHART_DIR}/Makefile not found in the downloaded source. No changes made."
  exit 1
fi

# ==============================================================================
# Failover upgrade
# ==============================================================================

# Apply the failover overlay using the existing image tag.
# The Make target intentionally performs an upgrade only; it never installs
# a new release.
log "Running make failover-upgrade (FAILOVER=${DESIRED_FAILOVER}, IMAGE_TAG=${IMAGE_TAG})..."
if ! make -C "${CHART_DIR}" failover-upgrade \
  NAMESPACE="${NAMESPACE}" \
  CLUSTER="${CLUSTER}" \
  IMAGE_TAG="${IMAGE_TAG}" \
  FAILOVER="${DESIRED_FAILOVER}"; then
  log "ERROR: make failover-upgrade failed. The next scheduled run will retry."
  exit 1
fi

# ==============================================================================
# Complete
# ==============================================================================

log "failover script done: release is now in the failover=${DESIRED_FAILOVER} state."
