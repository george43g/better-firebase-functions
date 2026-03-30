# Integration Testing and Deployment Benchmark Workflow

This document describes the production-like integration workflow used to validate
`better-firebase-functions` before release.

## What this workflow validates

1. **Real Firebase deployment** (not just emulator)
2. **Cold vs warm invocation behavior**
3. **Firebase Admin SDK + Firestore I/O path**
4. **BFF dynamic loading vs static exports baseline**
5. **Function logs and internal timing instrumentation**

## Test topology

- Firebase project: configurable via `PROJECT_ID` env var
  - default in script: `gramstr-dev`
  - dedicated project attempted: `bff-e2e-testing` (blocked by Firestore provisioning permissions)
- Region: `us-central1`
- Firestore: default database (`(default)`) in `nam5`
- Codebases deployed together:
  - `functions` (`codebase: bff`) using `exportFunctions()`
  - `functions-static` (`codebase: static`) using explicit static exports

## Benchmark functions

- `bffBenchmarkAdmin`
- `staticBenchmarkAdmin`

Both functions:

- run as Gen 2 HTTP functions
- use `firebase-admin` and call Firestore read + write
- include performance log lines and JSON timing output
- use this runtime shape for cleaner cold/warm comparison:
  - `minInstances: 0`
  - `maxInstances: 1`
  - `concurrency: 1`

## Run the full deployment benchmark

From repository root:

```bash
bash e2e/run-deploy-benchmark.sh

# or target a specific project
PROJECT_ID=your-project-id bash e2e/run-deploy-benchmark.sh
```

What the script does:

1. Ensures Firestore `(default)` exists
2. Installs and builds both function codebases
3. Deploys both codebases to Firebase
4. Invokes each function twice (cold then warm)
5. Pulls Firebase function logs
6. Prints benchmark log lines first
7. Prints a parsed cold vs warm summary table

## Required project prerequisites

Before deployment benchmarking can succeed on a project, ensure all of these are true:

1. Billing plan is **Blaze (pay-as-you-go)**
2. Firestore API is enabled and `(default)` database exists
3. Cloud Functions, Cloud Build, Artifact Registry, Eventarc APIs are enabled
4. An App Engine app exists in the project (required for some Cloud Functions resources)
5. Cloud Functions service accounts can read Artifact Registry metadata
   - Grant `roles/artifactregistry.reader` where needed

If deploy fails, `run-deploy-benchmark.sh` now prints filtered deploy/debug error lines
to make missing prerequisites obvious.

Artifacts are saved under:

`e2e/results/run-<timestamp>/`

including:

- raw response JSON for each case
- raw request timing from curl
- full function logs from Firebase CLI

## Log lines to inspect

The script highlights these first:

- `[better-firebase-functions] Directory Glob Search`
- `[better-firebase-functions] Search for Module ...`
- `[better-firebase-functions] Load Module (Cold-Start)`
- `[bench:bff] ...`
- `[bench:static] ...`

## Expected signal

- warm call should show higher `invocationCount` and `processUptimeMs`
- cold call should have larger startup-related timing values
- BFF calls should include BFF cold-start instrumentation lines
- static calls provide baseline behavior for comparison
