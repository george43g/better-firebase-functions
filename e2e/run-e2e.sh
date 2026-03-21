#!/bin/bash
# E2E test script for better-firebase-functions
# Starts the Firebase emulator, runs HTTP tests against it, then shuts down.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ID="bff-e2e-testing"
FUNCTIONS_PORT=5055
BASE_URL="http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1"
PASS=0
FAIL=0

# Build the core package first
echo "=== Building core package ==="
cd "$SCRIPT_DIR/.."
npx turbo build --filter=better-firebase-functions 2>/dev/null

# Build the E2E functions
echo "=== Building E2E functions ==="
cd "$SCRIPT_DIR/functions"
npm run build

# Start emulator in background
echo "=== Starting Firebase Emulator ==="
cd "$SCRIPT_DIR"
firebase emulators:start --only functions --project "$PROJECT_ID" &
EMULATOR_PID=$!

# Wait for emulator to be ready
echo "Waiting for emulator to start..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${FUNCTIONS_PORT}/" >/dev/null 2>&1; then
    echo "Emulator ready!"
    break
  fi
  sleep 1
done

# Test function: assert_json_field <url> <field> <expected_value> <test_name>
assert_json_field() {
  local url="$1"
  local field="$2"
  local expected="$3"
  local test_name="$4"
  
  local response
  response=$(curl -sf "$url" 2>&1) || {
    echo "  FAIL: $test_name (HTTP request failed)"
    FAIL=$((FAIL + 1))
    return
  }
  
  local actual
  actual=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$field',''))" 2>/dev/null)
  
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $test_name (expected '$expected', got '$actual')"
    echo "        Response: $response"
    FAIL=$((FAIL + 1))
  fi
}

# Run tests
echo ""
echo "=== Running E2E Tests ==="
echo ""

echo "--- HTTP Function Tests ---"
assert_json_field "${BASE_URL}/http-hello?name=World" "message" "Hello, World!" "http-hello returns greeting"
assert_json_field "${BASE_URL}/http-hello?name=BFF" "message" "Hello, BFF!" "http-hello accepts query param"
assert_json_field "${BASE_URL}/http-healthCheck" "status" "ok" "http-healthCheck returns ok"
assert_json_field "${BASE_URL}/http-healthCheck" "version" "7.0.0" "http-healthCheck returns version"
assert_json_field "${BASE_URL}/simple" "message" "Simple function at root level" "simple function works"

echo ""
echo "--- Cold-Start Optimization Tests ---"
# Verify function names are correctly set (indicates K_SERVICE/FUNCTION_NAME detection)
assert_json_field "${BASE_URL}/http-hello" "functionName" "http-hello" "http-hello knows its function name"
assert_json_field "${BASE_URL}/http-healthCheck" "functionName" "http-healthCheck" "http-healthCheck knows its function name"
assert_json_field "${BASE_URL}/simple" "functionName" "simple" "simple knows its function name"

# Summary
echo ""
echo "=== Results ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo "  Total:  $((PASS + FAIL))"

# Cleanup
echo ""
echo "=== Shutting down emulator ==="
kill $EMULATOR_PID 2>/dev/null
wait $EMULATOR_PID 2>/dev/null || true

# Exit with failure if any tests failed
if [ $FAIL -gt 0 ]; then
  exit 1
fi
echo "All E2E tests passed!"
