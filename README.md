# better-firebase-functions

**Automatically export and optimize Firebase Cloud Functions — with cold-start optimization built in.**

[![npm](https://img.shields.io/npm/v/better-firebase-functions)](https://www.npmjs.com/package/better-firebase-functions)
[![license](https://img.shields.io/npm/l/better-firebase-functions)](./LICENSE)

---

## What is this?

`better-firebase-functions` replaces the boilerplate of manually importing and exporting every Cloud Function trigger with a single call. More importantly, it implements a **cold-start optimization**: at runtime, only the single function module that is actually being invoked is loaded — not every function in your project.

In large projects with many functions, this can reduce cold-start time and memory usage significantly.

Supports **Gen 1** (`FUNCTION_NAME`) and **Gen 2** (`K_SERVICE` / Cloud Run) functions.

---

## Packages

This is a monorepo. The published packages are:

| Package | npm | Description |
|---|---|---|
| [`better-firebase-functions`](./packages/core) | [![npm](https://img.shields.io/npm/v/better-firebase-functions)](https://www.npmjs.com/package/better-firebase-functions) | Core library — zero dependencies |
| [`better-firebase-functions-esbuild`](./packages/esbuild) | [![npm](https://img.shields.io/npm/v/better-firebase-functions-esbuild)](https://www.npmjs.com/package/better-firebase-functions-esbuild) | esbuild plugin — per-function bundling |
| [`better-firebase-functions-webpack`](./packages/webpack) | [![npm](https://img.shields.io/npm/v/better-firebase-functions-webpack)](https://www.npmjs.com/package/better-firebase-functions-webpack) | webpack plugin — per-function bundling |
| [`better-firebase-functions-rollup`](./packages/rollup) | [![npm](https://img.shields.io/npm/v/better-firebase-functions-rollup)](https://www.npmjs.com/package/better-firebase-functions-rollup) | Rollup plugin — per-function bundling |

---

## Quick Start

### 1. Install

```sh
npm install better-firebase-functions
```

### 2. Replace your entry point

```typescript
// src/index.ts
import { exportFunctions } from 'better-firebase-functions';

exportFunctions({ __filename, exports });
```

### 3. Write your functions as default exports

```typescript
// src/functions/auth/on-create.func.ts
import { auth } from 'firebase-functions';

export default auth.user().onCreate(async (user) => {
  // ...
});
```

```typescript
// src/functions/http/get-user.func.ts
import { https } from 'firebase-functions/v2';

export default https.onRequest(async (req, res) => {
  res.json({ ok: true });
});
```

Functions are named automatically from their paths:
- `auth/on-create.func.ts` → `auth-onCreate`
- `http/get-user.func.ts` → `http-getUser`

Directory segments become **function groups**, so `firebase deploy --only functions:auth` works out of the box.

---

## How the Cold-Start Optimization Works

Without `better-firebase-functions`, your entry point imports every function module at startup — even if only one function is being invoked. In a large project with 50 functions, all 50 modules are loaded, initialized, and their dependencies resolved on every cold start.

With `better-firebase-functions`, the entry point uses the runtime environment variable (`FUNCTION_NAME` on Gen 1, `K_SERVICE` on Gen 2) to identify which function is running. It then loads **only that one module**. The other 49 are never touched.

```
Cold start without BFF:  load module A + B + C + D + ... (all 50)
Cold start with BFF:     load module A only
```

During **deployment** (when no function instance env var is set), all modules are loaded so Firebase CLI can discover every trigger — the full export is required at deploy time.

---

## API

### `exportFunctions(config)`

```typescript
import { exportFunctions } from 'better-firebase-functions';

exportFunctions({
  __filename,           // required: Node's __filename
  exports,              // required: Node's exports / module.exports

  // Optional:
  functionDirectoryPath: './functions',        // relative to entry point
  searchGlob: '**/*.func.{js,ts}',            // file pattern
  funcNameFromRelPath: (relPath) => string,    // custom name generator
  extractTrigger: (mod) => mod?.default,       // custom trigger extractor
  enableLogger: true,                          // performance timing logs
  logger: console,                             // custom logger
  exportPathMode: false,                       // build-tool mode (see bundler plugins)
});
```

### `exportFunctionsAsync(config)`

ESM-compatible async version using dynamic `import()`. Use this in ESM entry points or when your function files are ESM-only.

```typescript
// ESM entry point
import { exportFunctionsAsync } from 'better-firebase-functions';

const fns = await exportFunctionsAsync({
  __filename: import.meta.filename,
  exports: {},
});

export default fns;
```

---

## Bundler Plugins

For even better cold-start performance, use the bundler plugins to produce **independently bundled** files for each function — one output file per function, with tree shaking applied. This eliminates any shared code between functions and minimizes what the runtime needs to parse.

- **[esbuild](./packages/esbuild)** — `better-firebase-functions-esbuild`
- **[webpack](./packages/webpack)** — `better-firebase-functions-webpack`
- **[Rollup](./packages/rollup)** — `better-firebase-functions-rollup`

---

## Configuration Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `__filename` | `string` | — | **Required.** Node's `__filename` |
| `exports` | `object` | — | **Required.** Node's `exports` or `module.exports` |
| `functionDirectoryPath` | `string` | `'./'` | Directory containing function files, relative to entry point |
| `searchGlob` | `string` | `'**/*.{js,ts}'` | Glob pattern for matching function files |
| `funcNameFromRelPath` | `function` | built-in | Custom function name generator |
| `extractTrigger` | `function` | `mod?.default` | Custom trigger extractor from module |
| `enableLogger` | `boolean` | `false` | Enable performance timing logs |
| `logger` | `object` | `console` | Custom logger (must have `time`, `timeEnd`, `log`) |
| `exportPathMode` | `boolean` | `false` | Export file paths instead of triggers (for build tools) |

---

## File Naming Convention

Files are named automatically from their path relative to the functions directory:

| File | Exported as |
|---|---|
| `on-create.func.ts` | `onCreate` |
| `auth/on-create.func.ts` | `auth-onCreate` |
| `http/api/get-users.func.ts` | `http-api-getUsers` |

Dashes in the output denote **function groups** in Firebase, enabling group-scoped deploys.

---

## Requirements

- Node.js ≥ 18
- Firebase Functions Gen 1 or Gen 2
- CJS entry point (for `exportFunctions`); ESM supported via `exportFunctionsAsync`

---

## Contributing

Pull requests welcome. This project uses [Turborepo](https://turbo.build/) with npm workspaces.

```sh
git clone https://github.com/george43g/better-firebase-functions
npm install
npm run build   # build all packages
npm test        # run all tests
```
