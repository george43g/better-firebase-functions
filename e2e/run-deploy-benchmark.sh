#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ID="${PROJECT_ID:-bff-e2e-testing}"
REGION="us-central1"
RESULTS_DIR="${SCRIPT_DIR}/results"
RUN_ID="run-$(date +%s)"
OUT_DIR="${RESULTS_DIR}/${RUN_ID}"

mkdir -p "${OUT_DIR}"

echo "=== Benchmark Deployment Workflow ==="
echo "Project: ${PROJECT_ID}"
echo "Run ID:  ${RUN_ID}"
echo "Output:  ${OUT_DIR}"

echo ""
echo "=== Ensure Firestore Database Exists ==="
DB_LIST="$(firebase firestore:databases:list --project "${PROJECT_ID}" 2>&1 || true)"
if [[ "${DB_LIST}" != *"(default)"* ]]; then
  echo "Creating default Firestore database in nam5..."
  if ! firebase firestore:databases:create "(default)" --location nam5 --project "${PROJECT_ID}"; then
    echo "Failed to create Firestore database for ${PROJECT_ID}."
    echo "Please enable Firestore API + database for this project, then re-run."
    exit 1
  fi
else
  echo "Default Firestore database already exists."
fi

echo ""
echo "=== Install & Build Function Codebases ==="

echo "Packing local core library for deployable BFF benchmark..."
npm --prefix "${SCRIPT_DIR}/../packages/core" run build
rm -f "${SCRIPT_DIR}/functions/better-firebase-functions-local.tgz"
PACKED_NAME="$(cd "${SCRIPT_DIR}/../packages/core" && npm pack --pack-destination "${SCRIPT_DIR}/functions" --silent)"
mv "${SCRIPT_DIR}/functions/${PACKED_NAME}" "${SCRIPT_DIR}/functions/better-firebase-functions-local.tgz"

# Refresh lockfile to ensure file: tarball dependency integrity stays in sync.
rm -f "${SCRIPT_DIR}/functions/package-lock.json"
rm -rf "${SCRIPT_DIR}/functions/node_modules/better-firebase-functions"

npm --prefix "${SCRIPT_DIR}/functions" install
npm --prefix "${SCRIPT_DIR}/functions-static" install
npm --prefix "${SCRIPT_DIR}/functions" run build
npm --prefix "${SCRIPT_DIR}/functions-static" run build

echo ""
echo "=== Deploy Functions (BFF + Static) ==="
DEPLOY_LOG="${OUT_DIR}/deploy.log"
if ! firebase deploy \
  --project "${PROJECT_ID}" \
  --config "${SCRIPT_DIR}/firebase.json" \
  --force \
  --only functions:bff,functions:static,firestore:rules | tee "${DEPLOY_LOG}"; then
  echo ""
  echo "=== Deploy Failed: Key Error Lines ==="
  if command -v rg >/dev/null 2>&1; then
    rg "Failed to create function|PERMISSION_DENIED|App Engine|artifactregistry|Unable to retrieve the repository metadata|gcf-artifacts|generateUploadUrl" "${DEPLOY_LOG}" || true
  else
    sed -n '1,200p' "${DEPLOY_LOG}"
  fi

  if [[ -f "$(pwd)/firebase-debug.log" ]]; then
    echo ""
    echo "=== firebase-debug.log (filtered) ==="
    if command -v rg >/dev/null 2>&1; then
      rg "Failed to create function|PERMISSION_DENIED|artifactregistry|gcf-artifacts|appengine|generateUploadUrl" "$(pwd)/firebase-debug.log" || true
    fi
  fi
  exit 1
fi

BASE_URL="https://${REGION}-${PROJECT_ID}.cloudfunctions.net"
BFF_URL="${BASE_URL}/bffBenchmarkAdmin"
STATIC_URL="${BASE_URL}/staticBenchmarkAdmin"

invoke_and_record() {
  local label="$1"
  local phase="$2"
  local url="$3"
  local request_id="${RUN_ID}-${label}-${phase}"
  local body_file="${OUT_DIR}/${label}-${phase}.json"
  local time_file="${OUT_DIR}/${label}-${phase}.time"

  echo "Invoking ${label} (${phase})..."

  local total_time
  local curl_out
  curl_out="$(curl -sS --retry 5 --retry-delay 2 --retry-all-errors \
    -o "${body_file}" \
    -w "%{time_total} %{http_code}" \
    "${url}?runId=${request_id}&phase=${phase}")"

  local http_code
  total_time="${curl_out% *}"
  http_code="${curl_out##* }"

  if [[ "${http_code}" != "200" ]]; then
    echo "  request failed: http_status=${http_code}"
    echo "  response body:"
    sed -n '1,40p' "${body_file}"
    exit 1
  fi

  printf "%s\n" "${total_time}" > "${time_file}"
  echo "  total_time_s=${total_time} http_status=${http_code}"
}

echo ""
echo "=== Invoke Cold and Warm Requests ==="
invoke_and_record "bff" "cold" "${BFF_URL}"
sleep 2
invoke_and_record "bff" "warm" "${BFF_URL}"
sleep 2
invoke_and_record "static" "cold" "${STATIC_URL}"
sleep 2
invoke_and_record "static" "warm" "${STATIC_URL}"

echo ""
echo "=== Fetch Firebase Function Logs ==="
sleep 8
firebase functions:log --project "${PROJECT_ID}" --only bffBenchmarkAdmin --lines 200 > "${OUT_DIR}/functions-bff.log" || true
firebase functions:log --project "${PROJECT_ID}" --only staticBenchmarkAdmin --lines 200 > "${OUT_DIR}/functions-static.log" || true
cat "${OUT_DIR}/functions-bff.log" "${OUT_DIR}/functions-static.log" > "${OUT_DIR}/functions.log"

echo ""
echo "=== Firebase Logs (Performance Metrics) ==="
echo "Showing benchmark and BFF cold-start log lines first:"
if command -v rg >/dev/null 2>&1; then
  rg "\[bench:|\[better-firebase-functions\]|${RUN_ID}" "${OUT_DIR}/functions.log" || true
else
  sed -n '1,200p' "${OUT_DIR}/functions.log"
fi

echo ""
echo "=== Parsed Benchmark Summary ==="
python3 - <<'PY' "${OUT_DIR}"
import json
import pathlib
import sys

out = pathlib.Path(sys.argv[1])

def load_json(name):
    with (out / f"{name}.json").open() as f:
        return json.load(f)

def load_time(name):
    return float((out / f"{name}.time").read_text().strip())

cases = ["bff-cold", "bff-warm", "static-cold", "static-warm"]
rows = []
for case in cases:
    data = load_json(case)
    rows.append(
        {
            "case": case,
            "curl_total_ms": round(load_time(case) * 1000, 2),
            "handler_total_ms": round(float(data["timings"]["handlerTotalMs"]), 2),
            "firestore_read_ms": round(float(data["timings"]["firestoreReadMs"]), 2),
            "firestore_write_ms": round(float(data["timings"]["firestoreWriteMs"]), 2),
            "admin_init_ms": round(float(data["timings"]["adminInitMs"]), 2),
            "invocation_count": int(data["invocationCount"]),
            "uptime_ms": int(data["processUptimeMs"]),
            "cold_likely": bool(data["coldLikely"]),
        }
    )

headers = [
    "case",
    "curl_total_ms",
    "handler_total_ms",
    "admin_init_ms",
    "firestore_read_ms",
    "firestore_write_ms",
    "invocation_count",
    "uptime_ms",
    "cold_likely",
]

print(" | ".join(headers))
print(" | ".join(["---"] * len(headers)))
for row in rows:
    print(" | ".join(str(row[h]) for h in headers))

bff_improvement = rows[0]["handler_total_ms"] - rows[1]["handler_total_ms"]
static_improvement = rows[2]["handler_total_ms"] - rows[3]["handler_total_ms"]
print()
print(f"BFF cold->warm handler improvement: {bff_improvement:.2f} ms")
print(f"Static cold->warm handler improvement: {static_improvement:.2f} ms")
PY

echo ""
echo "Saved artifacts in: ${OUT_DIR}"
echo "Done."
