#!/usr/bin/env bash
# Bundler smoke-test deployment workflow.
# Builds all three bundlers from the same BFF source, deploys each to Firebase,
# invokes the smoke function, and verifies a 200 response with correct metadata.
#
# Prerequisites:
#   - Firebase CLI installed (npm i -g firebase-tools)
#   - Firebase authenticated (firebase login or GOOGLE_APPLICATION_CREDENTIALS set)
#   - PROJECT_ID env var set (or defaults to bff-e2e-testing)
#
# Usage:
#   PROJECT_ID=bff-e2e-testing ./e2e/run-bundler-smoke.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ID="${PROJECT_ID:-bff-e2e-testing}"
REGION="us-central1"
RESULTS_DIR="${SCRIPT_DIR}/results"
RUN_ID="bundler-smoke-$(date +%s)"
OUT_DIR="${RESULTS_DIR}/${RUN_ID}"

mkdir -p "${OUT_DIR}"

echo "=== BFF Bundler Smoke Test ==="
echo "Project: ${PROJECT_ID}"
echo "Run ID:  ${RUN_ID}"
echo "Output:  ${OUT_DIR}"

# ---------------------------------------------------------------------------
# 1. Build core and repack local tarball for bundled codebases
# ---------------------------------------------------------------------------
echo ""
echo "=== Build & Pack Core Library ==="
npm --prefix "${REPO_DIR}/packages/core" run build
rm -f "${SCRIPT_DIR}/functions-bundled/better-firebase-functions-local.tgz"
PACKED_NAME="$(cd "${REPO_DIR}/packages/core" && npm pack --pack-destination "${SCRIPT_DIR}/functions-bundled" --silent)"
mv "${SCRIPT_DIR}/functions-bundled/${PACKED_NAME}" "${SCRIPT_DIR}/functions-bundled/better-firebase-functions-local.tgz"

# Refresh tarball in each codebase
for CODEBASE in bundler-esbuild bundler-webpack bundler-rollup; do
  rm -f "${SCRIPT_DIR}/functions-bundled/${CODEBASE}/better-firebase-functions-local.tgz"
  cp "${SCRIPT_DIR}/functions-bundled/better-firebase-functions-local.tgz" \
     "${SCRIPT_DIR}/functions-bundled/${CODEBASE}/better-firebase-functions-local.tgz" 2>/dev/null || true
  rm -f "${SCRIPT_DIR}/functions-bundled/${CODEBASE}/package-lock.json"
  rm -rf "${SCRIPT_DIR}/functions-bundled/${CODEBASE}/node_modules/better-firebase-functions"
  npm --prefix "${SCRIPT_DIR}/functions-bundled/${CODEBASE}" install
done

# Refresh the main functions-bundled node_modules too (used by build scripts)
rm -f "${SCRIPT_DIR}/functions-bundled/package-lock.json"
rm -rf "${SCRIPT_DIR}/functions-bundled/node_modules/better-firebase-functions"
npm --prefix "${SCRIPT_DIR}/functions-bundled" install

echo ""
echo "=== Build All Bundlers ==="
npx tsx "${SCRIPT_DIR}/bundler-builds/build-esbuild.ts" "${SCRIPT_DIR}/functions-bundled/bundler-esbuild/lib"
npx tsx "${SCRIPT_DIR}/bundler-builds/build-webpack.ts" "${SCRIPT_DIR}/functions-bundled/bundler-webpack/lib"
npx tsx "${SCRIPT_DIR}/bundler-builds/build-rollup.ts"  "${SCRIPT_DIR}/functions-bundled/bundler-rollup/lib"

echo ""
echo "Bundler outputs:"
for b in esbuild webpack rollup; do
  echo "  ${b}:"
  find "${SCRIPT_DIR}/functions-bundled/bundler-${b}/lib" -name "*.js" 2>/dev/null | sort | sed 's/^/    /' || echo "    (no output found)"
done

# ---------------------------------------------------------------------------
# 2. Deploy bundler codebases
# ---------------------------------------------------------------------------
echo ""
echo "=== Deploy Bundler Codebases ==="
DEPLOY_LOG="${OUT_DIR}/deploy.log"
if ! firebase deploy \
  --project "${PROJECT_ID}" \
  --config "${SCRIPT_DIR}/firebase.json" \
  --force \
  --only functions:bundler-esbuild,functions:bundler-webpack,functions:bundler-rollup \
  | tee "${DEPLOY_LOG}"; then
  echo ""
  echo "=== Deploy Failed ==="
  grep -E "error|Error|FAILED|Container" "${DEPLOY_LOG}" | head -20 || true
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Invoke each bundler's smoke function
# Parse the function URLs directly from the deploy log output.
# ---------------------------------------------------------------------------
echo ""
echo "=== Invoke Smoke Functions ==="

get_function_url() {
  local codebase="$1"
  local bundler="$2"
  local bundler_capitalized
  bundler_capitalized="${bundler^}"
  # Firebase CLI prints lines like:
  # Function URL (bundler-esbuild:bundlerEsbuildSmoke(us-central1)): https://...
  python3 - <<'PY' "${DEPLOY_LOG}" "${codebase}" "bundler${bundler_capitalized}Smoke"
import re
import sys

log_path, codebase, func_name = sys.argv[1:4]
pattern = re.compile(rf"Function URL \({re.escape(codebase)}:{re.escape(func_name)}\([^)]+\)\): (\S+)")

with open(log_path, 'r', encoding='utf-8') as fh:
    for line in fh:
        clean_line = re.sub(r'\x1b\[[0-9;]*m', '', line)
        match = pattern.search(clean_line)
        if match:
            print(match.group(1))
            break
PY
}

smoke_invoke() {
  local bundler="$1"
  local codebase="bundler-${bundler}"
  local url
  url="$(get_function_url "${codebase}" "${bundler}")"

  if [[ -z "${url}" ]]; then
    echo "  FAILED: could not extract URL for codebase ${codebase} from deploy log"
    echo "  Looking in: ${DEPLOY_LOG}"
    grep "Function URL" "${DEPLOY_LOG}" | head -10 || true
    return 1
  fi

  echo "Invoking ${bundler} (${url})..."
  local body_file="${OUT_DIR}/smoke-${bundler}.json"
  local curl_out
  curl_out="$(curl -sS --retry 5 --retry-delay 2 --retry-all-errors \
    -o "${body_file}" \
    -w "%{time_total} %{http_code}" \
    "${url}?bundler=${bundler}&runId=${RUN_ID}")"

  local total_time http_code
  total_time="${curl_out% *}"
  http_code="${curl_out##* }"

  if [[ "${http_code}" != "200" ]]; then
    echo "  FAILED: http_status=${http_code}"
    head -20 "${body_file}" || true
    return 1
  fi

  local ok bundler_in_response
  ok="$(python3 -c "import json,sys; d=json.load(open('${body_file}')); print(d.get('ok',''))")"
  bundler_in_response="$(python3 -c "import json,sys; d=json.load(open('${body_file}')); print(d.get('bundler',''))")"

  echo "  http_status=${http_code} total_time_s=${total_time} ok=${ok} bundler=${bundler_in_response}"

  if [[ "${ok}" != "True" && "${ok}" != "true" ]]; then
    echo "  FAILED: response ok field is not true"
    return 1
  fi
}

FAILED=0
for bundler in esbuild webpack rollup; do
  smoke_invoke "${bundler}" || FAILED=$((FAILED + 1))
done

echo ""
if [[ "${FAILED}" -gt 0 ]]; then
  echo "BUNDLER SMOKE TEST FAILED: ${FAILED}/3 bundler(s) failed"
  exit 1
else
  echo "BUNDLER SMOKE TEST PASSED: all 3 bundlers deployed and responded correctly"
fi

echo "Artifacts saved in: ${OUT_DIR}"
