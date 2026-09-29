#!/bin/bash
# Automated version of the manual scenario testing done while building
# scale.sh — every case here was previously run by hand against a live
# Docker container and is now checked on every change instead of relying on
# memory. Builds the REAL n8n-replica-scaler/Dockerfile, layers the test
# harness (fake oc/curl) on top of it, then runs each scenario and asserts
# its exit code and (where relevant) whether any scale calls happened.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCALER_DIR="$(cd "${HERE}/.." && pwd)"

PASS=0
FAIL=0

log() { echo "[test-runner] $*" >&2; }

log "Building the real n8n-replica-scaler image..."
docker build -q -t n8n-replica-scaler:under-test -f "${SCALER_DIR}/Dockerfile" "${SCALER_DIR}" > /dev/null

log "Extracting scale.sh from the Helm template..."
"${HERE}/extract-script.sh" "${HERE}/scale.sh"

log "Building the test harness image..."
docker build -q -t n8n-replica-scaler-test-harness -f "${HERE}/Dockerfile.test" "${HERE}" > /dev/null

# Routing has just failed over to secondary, well past any stabilization
# threshold used in these scenarios — reused by every scale-up-eligible case.
STABLE_SECONDARY_BODY='{"current_routing":"secondary","duration_seconds":90}'

# --- Baseline env, shared by every scenario, overridden per-scenario below ---
BASELINE=(
  -e DNS_PROBE_STATUS_URL=https://fake
  -e SCALE_UP_STABILIZATION_SECONDS=60
  -e SCALE_DOWN_STABILIZATION_SECONDS=600
  -e DEPLOY_MAIN=chwf-n8n-main
  -e DEPLOY_WORKER=chwf-n8n-worker
  -e DEPLOY_WEBHOOK=chwf-n8n-webhook
  -e DEPLOY_RUNNER=chwf-n8n-runner
  -e STANDBY_MAIN=1
  -e STANDBY_WORKER=1
  -e STANDBY_WEBHOOK=1
  -e STANDBY_RUNNER=1
  -e ACTIVE_MAIN=1
  -e ACTIVE_WORKER=3
  -e ACTIVE_WEBHOOK=2
  -e ACTIVE_RUNNER=2
  -e FAKE_OC_REPLICAS_chwf_n8n_main=1
  -e FAKE_OC_REPLICAS_chwf_n8n_worker=1
  -e FAKE_OC_REPLICAS_chwf_n8n_webhook=1
  -e FAKE_OC_REPLICAS_chwf_n8n_runner=1
)

# Runs one scenario. Args: name, expected_exit_code, [extra docker -e flags...]
# Scenario body (the FAKE_CURL_BODY etc.) is passed via the caller setting
# SCENARIO_ENV before calling this function.
run_scenario() {
  local name="$1"
  local expected_exit="$2"
  shift 2

  local output
  local actual_exit=0
  output=$(docker run --rm "${BASELINE[@]}" "$@" \
    --entrypoint bash n8n-replica-scaler-test-harness \
    -c 'rm -f /tmp/scale-calls.log /tmp/fake-curl-call-count; /scale.sh; echo "EXIT_CODE:$?"; echo "--- scale-calls ---"; cat /tmp/scale-calls.log 2>/dev/null' 2>&1) || true
  actual_exit=$(echo "$output" | grep -o 'EXIT_CODE:[0-9]*' | cut -d: -f2)

  if [[ "${actual_exit}" = "${expected_exit}" ]]; then
    log "PASS: ${name} (exit ${actual_exit})"
    PASS=$((PASS + 1))
  else
    log "FAIL: ${name} — expected exit ${expected_exit}, got ${actual_exit}"
    echo "$output" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
  fi
  echo "$output"
}

assert_no_scale_calls() {
  local name="$1"
  local output="$2"
  if echo "$output" | grep -q "SCALE_CALL:"; then
    log "FAIL: ${name} — expected zero scale calls, but found some"
    FAIL=$((FAIL + 1))
  else
    log "PASS: ${name} (zero scale calls, as expected)"
    PASS=$((PASS + 1))
  fi
}

assert_scale_call() {
  local name="$1"
  local output="$2"
  local expected_call="$3"
  if echo "$output" | grep -q "${expected_call}"; then
    log "PASS: ${name} (found ${expected_call})"
    PASS=$((PASS + 1))
  else
    log "FAIL: ${name} — expected to find ${expected_call}, did not"
    FAIL=$((FAIL + 1))
  fi
}

# --- Scenarios ---

out=$(run_scenario "normal scale-up" 0 \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}")
assert_scale_call "normal scale-up scales worker to 3" "$out" "SCALE_CALL:chwf-n8n-worker:3"

out=$(run_scenario "scale-up not yet stabilized" 0 \
  -e FAKE_CURL_BODY='{"current_routing":"secondary","duration_seconds":30}')
assert_no_scale_calls "scale-up not yet stabilized" "$out"

out=$(run_scenario "scale-down after stabilization" 0 \
  -e FAKE_OC_REPLICAS_chwf_n8n_worker=3 -e FAKE_OC_REPLICAS_chwf_n8n_webhook=2 -e FAKE_OC_REPLICAS_chwf_n8n_runner=2 \
  -e FAKE_CURL_BODY='{"current_routing":"primary","duration_seconds":700}')
assert_scale_call "scale-down scales worker to 1" "$out" "SCALE_CALL:chwf-n8n-worker:1"

out=$(run_scenario "scale-down not yet stabilized (asymmetric threshold)" 0 \
  -e FAKE_OC_REPLICAS_chwf_n8n_worker=3 \
  -e FAKE_CURL_BODY='{"current_routing":"primary","duration_seconds":300}')
assert_no_scale_calls "scale-down not yet stabilized" "$out"

out=$(run_scenario "unknown routing" 1 \
  -e FAKE_CURL_BODY='{"current_routing":"unknown","duration_seconds":9999}')
assert_no_scale_calls "unknown routing" "$out"

out=$(run_scenario "malformed JSON" 1 \
  -e FAKE_CURL_BODY='not valid json')
assert_no_scale_calls "malformed JSON" "$out"

out=$(run_scenario "pre-flight failure (webhook unreadable)" 1 \
  -e FAKE_OC_REPLICAS_chwf_n8n_webhook= \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}")
assert_no_scale_calls "pre-flight failure" "$out"

out=$(run_scenario "dns-probe HTTP 503" 1 \
  -e FAKE_CURL_HTTP_STATUS=503 -e FAKE_CURL_BODY='{}')
assert_no_scale_calls "dns-probe HTTP 503" "$out"

out=$(run_scenario "routing changes mid-run (race check)" 0 \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}" \
  -e FAKE_CURL_BODY_2='{"current_routing":"primary","duration_seconds":5}')
assert_no_scale_calls "routing changes mid-run" "$out"

out=$(run_scenario "duration resets on recheck (same category)" 0 \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}" \
  -e FAKE_CURL_BODY_2='{"current_routing":"secondary","duration_seconds":5}')
assert_no_scale_calls "duration resets on recheck" "$out"

out=$(run_scenario "non-numeric duration_seconds" 1 \
  -e FAKE_CURL_BODY='{"current_routing":"secondary","duration_seconds":"abc"}')
assert_no_scale_calls "non-numeric duration_seconds" "$out"

out=$(run_scenario "already at target (no-op)" 0 \
  -e FAKE_OC_REPLICAS_chwf_n8n_worker=3 -e FAKE_OC_REPLICAS_chwf_n8n_webhook=2 -e FAKE_OC_REPLICAS_chwf_n8n_runner=2 \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}")
assert_no_scale_calls "already at target (no-op, no changes needed)" "$out"

out=$(run_scenario "runtime target validation: non-numeric" 1 \
  -e ACTIVE_WORKER=abc \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}")
assert_no_scale_calls "runtime target validation: non-numeric" "$out"

out=$(run_scenario "runtime target validation: out of range" 1 \
  -e ACTIVE_WORKER=999 \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}")
assert_no_scale_calls "runtime target validation: out of range" "$out"

out=$(run_scenario "mid-loop scale failure (webhook fails)" 1 \
  -e FAKE_OC_SCALE_FAIL=chwf-n8n-webhook \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}")
assert_scale_call "mid-loop failure: worker scaled before webhook failed" "$out" "SCALE_CALL:chwf-n8n-worker:3"
if echo "$out" | grep -q "SCALE_CALL:chwf-n8n-webhook:"; then
  log "FAIL: mid-loop failure — webhook should NOT have a recorded scale call"
  FAIL=$((FAIL + 1))
else
  log "PASS: mid-loop failure — webhook correctly has no recorded scale call"
  PASS=$((PASS + 1))
fi

out=$(docker run --rm "${BASELINE[@]}" \
  -e FAKE_CURL_BODY="${STABLE_SECONDARY_BODY}" \
  --entrypoint bash n8n-replica-scaler-test-harness \
  -c 'mv /usr/bin/jq /usr/bin/jq.bak; /scale.sh; echo "EXIT_CODE:$?"; mv /usr/bin/jq.bak /usr/bin/jq' 2>&1) || true
tool_exit=$(echo "$out" | grep -o 'EXIT_CODE:[0-9]*' | cut -d: -f2)
if [[ "${tool_exit}" = "1" ]]; then
  log "PASS: missing tool (jq) fails fast (exit 1)"
  PASS=$((PASS + 1))
else
  log "FAIL: missing tool (jq) — expected exit 1, got ${tool_exit}"
  FAIL=$((FAIL + 1))
fi

rm -f "${HERE}/scale.sh"

echo ""
log "===== ${PASS} passed, ${FAIL} failed ====="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
