#!/bin/bash
# Builds ops-toolbox/Dockerfile and checks that every CLI runs at container
# runtime (not just at build time), both as the image's default user and as
# an arbitrary UID in group 0 the way OpenShift's restricted SCC runs it.
# $HOME must be writable in both cases because helm and oc cache there.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="chwf-ops-toolbox:test"

docker build -q -t "${IMAGE}" "${HERE}" > /dev/null

CHECK='set -e
bash --version > /dev/null
curl --version > /dev/null
jq --version
make --version | head -1
helm version --short
oc version --client
touch "${HOME}/.write-test" && rm "${HOME}/.write-test"
echo "HOME (${HOME}) is writable as uid $(id -u)"'

for user in "" "1000680000:0"; do
  echo "--- running as ${user:-default user} ---"
  docker run --rm ${user:+--user "${user}"} --entrypoint bash "${IMAGE}" -c "${CHECK}"
done

echo "Ops-toolbox image test passed."
