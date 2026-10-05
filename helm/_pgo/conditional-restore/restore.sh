#!/bin/bash
set -eo pipefail

# ==============================================================================
# Logging
# ==============================================================================

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# ==============================================================================
# Kubernetes API configuration
# ==============================================================================
#
# backup-container has curl but no oc/kubectl, so use the ServiceAccount
# credentials and CA certificate mounted by Kubernetes to call the API directly.
KUBE_API="https://kubernetes.default.svc"
KUBE_TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
KUBE_NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
KUBE_CACERT="/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"

log "pg-conditional-restore starting..."

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
#
# Check DR failover status ---
log "Querying DNS probe: ${DNS_PROBE_STATUS_URL}"

if ! fetch_probe_status; then
  log "Could not safely determine DR routing state. No restore."
  exit 1
fi

log "current_routing=${ROUTING} duration_seconds=${DURATION}"

if [ "${ROUTING}" != "primary" ] && [ "${ROUTING}" != "secondary" ]; then
  log "WARNING: current_routing=${ROUTING} is not a recognized routing state. No restore."
  exit 1
fi

# --- Condition A: GoldDR is the active primary (DNS failover) — skip restore ---
if [ "${ROUTING}" = "secondary" ]; then
  log "GoldDR is the active primary (current_routing=secondary). Skipping restore."
  exit 0
fi

# --- Condition B: Gold routing is too recent — skip restore until stable ---
if ! [[ "${STABILIZATION_SECONDS}" =~ ^[0-9]+$ ]]; then
  log "ERROR: STABILIZATION_SECONDS is not a valid non-negative integer (got '${STABILIZATION_SECONDS}')."
  exit 1
fi

if [ "${DURATION}" -lt "${STABILIZATION_SECONDS}" ]; then
  log "Gold routing has only been stable for ${DURATION}s (< ${STABILIZATION_SECONDS}s). Skipping restore until stable."
  exit 0
fi

# --- Condition C: GoldDR is standby — restore each database if a new backup exists ---
log "GoldDR is in standby mode (current_routing=primary). Checking for new backups..."

# ==============================================================================
# S3 configuration and helpers
# ==============================================================================
#
# S3_BUCKET is "bucket-name/path/prefix" — split for API calls
S3_BUCKET_NAME=$(echo "${S3_BUCKET}" | cut -d'/' -f1)
S3_PREFIX=$(echo "${S3_BUCKET}" | cut -d'/' -f2- | sed 's:/*$:/:')

# Percent-encode a string for use in a URL query parameter — needed for
# the continuation token below, which can contain +, /, = and isn't safe
# to pass unencoded in a query string.
urlencode() {
  local string="$1" strlen encoded pos c
  strlen=${#string}
  encoded=""
  for (( pos=0; pos<strlen; pos++ )); do
    c="${string:$pos:1}"
    case "$c" in
      [-_.~a-zA-Z0-9]) encoded+="$c" ;;
      *) encoded+=$(printf '%%%02X' "'$c") ;;
    esac
  done
  echo "${encoded}"
}

# Fetch every page of an S3 listing for the given query string
# (e.g. "prefix=X" or "prefix=X&start-after=Y"), following pagination
# via continuation-token. S3 returns up to 1000 keys per request, so a
# single request may not include everything the query matches.
fetch_s3_list() {
  local query="$1"
  local list="" continuation_token="" page url is_truncated
  while :; do
    if [ -n "${continuation_token}" ]; then
      url="${S3_ENDPOINT}/${S3_BUCKET_NAME}?list-type=2&${query}&continuation-token=$(urlencode "${continuation_token}")"
    else
      url="${S3_ENDPOINT}/${S3_BUCKET_NAME}?list-type=2&${query}"
    fi

    if ! page=$(curl -sf --aws-sigv4 "aws:amz:us-east-1:s3" \
      -u "${S3_USER}:${S3_PASSWORD}" \
      "${url}"); then
      log "ERROR: S3 listing failed for query '${query}'."
      return 1
    fi

    list="${list}${page}"

    is_truncated=$(echo "${page}" | grep -o '<IsTruncated>[^<]*</IsTruncated>' | sed 's/<[^>]*>//g')
    if [ "${is_truncated}" != "true" ]; then
      break
    fi
    continuation_token=$(echo "${page}" | grep -o '<NextContinuationToken>[^<]*</NextContinuationToken>' | sed 's/<[^>]*>//g')
    if [ -z "${continuation_token}" ]; then
      log "WARNING: S3 listing reported IsTruncated=true but no NextContinuationToken was found. Stopping pagination early - results may be incomplete."
      break
    fi
  done
  echo "${list}"
}

# ==============================================================================
# Database restore processing
# ==============================================================================
#
# Iterate each database: find its latest backup, compare state, restore if new ---
for i in $(seq 0 $((DATABASE_COUNT-1))); do
  DB_NAME_VAR="DATABASE_${i}_NAME"; DB_NAME="${!DB_NAME_VAR}"
  DB_PASS="${DATABASE_PASSWORD}" # pragma: allowlist secret

  log "[${DB_NAME}] Checking for latest backup..."

  # ============================================================================
  # Restore state
  # ============================================================================

  # Read the last restored key for this database BEFORE listing, since
  # it determines whether we can do a scoped listing or need a
  # full scan.
  STATE_KEY="${DB_NAME}.last-restored-key"

  LAST_KEY=$(curl -sf --cacert "${KUBE_CACERT}" \
    -H "Authorization: Bearer ${KUBE_TOKEN}" \
    "${KUBE_API}/api/v1/namespaces/${KUBE_NS}/configmaps/${STATE_CONFIGMAP_NAME}" \
    2>/dev/null \
    | grep -o "\"${STATE_KEY}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | head -1 \
    | cut -d'"' -f4 || echo "")

  log "[${DB_NAME}] Last restored key: ${LAST_KEY:-<none>}"

  # ============================================================================
  # S3 backup listing
  # ============================================================================

  if [ -n "${LAST_KEY}" ]; then
    # Fast path: use the last restored key to scope the listing to this
    # database and only look for backups created after it.
    DB_PREFIX="${LAST_KEY%%-${DB_NAME}_*}-${DB_NAME}_"
    log "[${DB_NAME}] Using scoped listing (prefix=${DB_PREFIX}, after last restored key)."
    if ! DB_LIST=$(fetch_s3_list "prefix=${DB_PREFIX}&start-after=$(urlencode "${LAST_KEY}")"); then
      log "[${DB_NAME}] ERROR: Unable to list S3 backups. No restore performed."
      exit 1
    fi
  else
    # First run: no previous key is available, so scan the shared prefix.
    log "[${DB_NAME}] No prior restored key - falling back to a full listing."
    if ! DB_LIST=$(fetch_s3_list "prefix=${S3_PREFIX}"); then
      log "[${DB_NAME}] ERROR: Unable to list S3 backups. No restore performed."
      exit 1
    fi
  fi

  # Match the database name exactly so "n8n" does not match "n8n-custom".
  LATEST_KEY=$(echo "${DB_LIST}" \
    | grep -o '<Key>[^<]*</Key>' \
    | sed 's/<Key>//;s/<\/Key>//' \
    | grep -v '/$' \
    | grep -F -- "-${DB_NAME}_" \
    | sort \
    | tail -1 || true)

  # ============================================================================
  # Backup selection
  # ============================================================================
  if [ -z "${LATEST_KEY}" ]; then
    if [ -n "${LAST_KEY}" ]; then
      log "[${DB_NAME}] No new backup since last restore (${LAST_KEY}). Skipping."
    else
      log "[${DB_NAME}] WARNING: No backup files found matching '${DB_NAME}' at ${S3_ENDPOINT}/${S3_BUCKET_NAME}/${S3_PREFIX}. Skipping."
    fi
    continue
  fi

  log "[${DB_NAME}] Latest backup on S3: ${LATEST_KEY}"

  if [ "${LATEST_KEY}" = "${LAST_KEY}" ]; then
    log "[${DB_NAME}] Latest backup already restored. Skipping."
    continue
  fi

  # ============================================================================
  # Download and verify backup
  # ============================================================================

  # New backup detected — download, verify, then restore
  log "[${DB_NAME}] New backup detected. Downloading ${LATEST_KEY}..."
  curl -sf --aws-sigv4 "aws:amz:us-east-1:s3" \
    -u "${S3_USER}:${S3_PASSWORD}" \
    -o /tmp/restore.sql.gz \
    "${S3_ENDPOINT}/${S3_BUCKET_NAME}/${LATEST_KEY}"

  log "[${DB_NAME}] Verifying downloaded archive..."
  gunzip -t /tmp/restore.sql.gz

  # ============================================================================
  # Database restore
  # ============================================================================

  # Drop schema only after confirming the backup file is intact
  log "[${DB_NAME}] Dropping and recreating public schema..."
  PGPASSWORD="${DB_PASS}" psql \
    -h "${DATABASE_HOST}" \
    -p "${DATABASE_PORT}" \
    -U "${DATABASE_USER}" \
    -d "${DB_NAME}" \
    -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION pg_database_owner; GRANT USAGE ON SCHEMA public TO PUBLIC; COMMENT ON SCHEMA public IS 'standard public schema';" || true

  log "[${DB_NAME}] Restoring from downloaded backup..."
  gunzip -c /tmp/restore.sql.gz | PGPASSWORD="${DB_PASS}" psql \
    -h "${DATABASE_HOST}" \
    -p "${DATABASE_PORT}" \
    -U "${DATABASE_USER}" \
    -d "${DB_NAME}" \
    -v ON_ERROR_STOP=0

  rm -f /tmp/restore.sql.gz
  log "[${DB_NAME}] Restore complete."

  # ============================================================================
  # Restore state update
  # ============================================================================

  # Update per-database state key
  log "[${DB_NAME}] Updating restore state (${STATE_KEY}=${LATEST_KEY})..."
  curl -sf --cacert "${KUBE_CACERT}" \
    -X PATCH \
    -H "Authorization: Bearer ${KUBE_TOKEN}" \
    -H "Content-Type: application/merge-patch+json" \
    "${KUBE_API}/api/v1/namespaces/${KUBE_NS}/configmaps/${STATE_CONFIGMAP_NAME}" \
    -d "{\"data\":{\"${STATE_KEY}\":\"${LATEST_KEY}\"}}" \
    > /dev/null
done

# ==============================================================================
# Complete
# ==============================================================================

log "pg-conditional-restore done."
