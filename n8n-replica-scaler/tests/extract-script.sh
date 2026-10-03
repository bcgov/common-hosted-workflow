#!/bin/bash
# Extracts the plain bash body of scale.sh from the Helm ConfigMap template
# (helm/_pgo/templates/n8n-replica-scaler/script.yaml), stripping the Go
# template wrapper and the fixed 4-space YAML indentation under `scale.sh: |`.
# The script under test is the exact thing Helm renders into the CronJob's
# ConfigMap, not a hand-maintained copy that could drift from it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_SRC="${HERE}/../../helm/_pgo/templates/n8n-replica-scaler/script.yaml"
OUT="${1:-${HERE}/scale.sh}"

if [[ ! -f "${SCRIPT_SRC}" ]]; then
  echo "ERROR: ${SCRIPT_SRC} not found" >&2
  exit 1
fi

awk '
  /^    #!\/bin\/bash$/ { capture=1 }
  capture && /^\{\{- end \}\}$/ { exit }
  capture { print substr($0, 5) }
' "${SCRIPT_SRC}" > "${OUT}"

if [[ ! -s "${OUT}" ]]; then
  echo "ERROR: extracted script is empty — the awk markers in this file no longer match helm/_pgo/templates/n8n-replica-scaler/script.yaml's structure" >&2
  exit 1
fi

chmod +x "${OUT}"
echo "Extracted $(wc -l < "${OUT}") lines to ${OUT}"
