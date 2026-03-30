# better-firebase-functions

**Auto-export Firebase Cloud Functions with cold-start optimization built in.**

[![npm](https://img.shields.io/npm/v/better-firebase-functions)](https://www.npmjs.com/package/better-firebase-functions)
[![CI](https://github.com/george43g/better-firebase-functions/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/george43g/better-firebase-functions/actions/workflows/npm-publish.yml)
[![license](https://img.shields.io/npm/l/better-firebase-functions)](./LICENSE)

---

## What is this?

`better-firebase-functions` replaces the boilerplate of manually importing and exporting every trigger with a single call. More importantly, it implements a **cold-start optimization**: at runtime, only the single function module that is actually being invoked is loaded — not every function in your project.

In large projects with many functions this can reduce cold-start time and memory usage significantly. In single-function projects it adds zero overhead.

Supports:
- **Gen 1** functions (`FUNCTION_NAME`)
- **Gen 2** functions / Cloud Run (`K_SERVICE`, `FUNCTION_TARGET`)
- **CJS and ESM** entry points
- **esbuild, webpack, and Rollup** for per-function bundling (optional, takes the optimization further)

---

## Packages

| Package | Description |
|---|---|
| [`better-firebase-functions`](./packages/core) | Core runtime library. Zero dependencies. |
| [`better-firebase-functions-esbuild`](./packages/esbuild) | esbuild build helper for per-function bundles |
| [`better-firebase-functions-webpack`](./packages/webpack) | webpack plugin for per-function bundles |
| [`better-firebase-functions-rollup`](./packages/rollup) | Rollup plugin for per-function bundles |

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

exportFunctions({
  __filename,
  exports,
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
});
```

> **Note on `searchGlob`:** the glob should match files as they exist **at runtime after compilation** (i.e. `.js` files). If you run TypeScript natively (via `tsx`, `ts-node`, etc.) you can glob `.ts` directly. Bundler plugins automatically expand `.js` globs to include `.ts` source files at build time.

### 3. Write each trigger as a default export

```typescript
// src/functions/http/get-user.func.ts
import { onRequest } from 'firebase-functions/v2/https';

export default onRequest(async (req, res) => {
  res.json({ ok: true });
});
```

```typescript
// src/functions/auth/on-create.func.ts
import { auth } from 'firebase-functions';

export default auth.user().onCreate(async (user) => {
  // ...
});
```

Functions are named automatically from their file paths relative to `functionDirectoryPath`:

| File | Exported as |
|---|---|
| `functions/on-create.func.ts` | `onCreate` |
| `functions/auth/on-create.func.ts` | `auth-onCreate` |
| `functions/http/api/get-users.func.ts` | `http-api-getUsers` |

Dashes in the name create **Firebase function groups**, so `firebase deploy --only functions:auth` works out of the box.

---

## How the Cold-Start Optimization Works

Without BFF, your entry point imports every function module at startup. In a project with 50 functions, all 50 modules are loaded, their dependencies resolved, and their closures formed on every cold start — even though only one function is being invoked.

With BFF, the entry point checks the runtime environment (`FUNCTION_TARGET`, `FUNCTION_NAME`, `K_SERVICE`) to identify which function is running. It then loads **only that module**. The other 49 are skipped entirely.

```
Without BFF:  load module A + B + C + D + ... + N  (all N modules)
With BFF:     load module A only
```

During **deployment** (when no function-instance env var is set), BFF loads all modules so Firebase CLI can discover every trigger. This is the only time all modules are loaded.

The optimization is **purely subtractive** — it can only help, never hurt.

---

## API Reference

### `exportFunctions(config)` — synchronous, CJS

```typescript
import { exportFunctions } from 'better-firebase-functions';

exportFunctions({
  __filename,           // required — Node's __filename
  exports,              // required — Node's exports / module.exports

  // Discovery — all optional, defaults shown:
  functionDirectoryPath: './',                     // relative to __dirname / entry point dir
  searchGlob: '**/*.{js,ts}',                     // glob matching trigger files at runtime
  funcNameFromRelPath: funcNameFromRelPathDefault, // custom name generator
  __dirname: undefined,                            // override base dir (derived from __filename)

  // Module loading — optional:
  extractTrigger: (mod) => mod?.default,           // extract trigger from loaded module

  // Logging — optional:
  enableLogger: false,                             // enable performance timing logs
  logger: console,                                 // custom logger object

  // Build tools — optional:
  exportPathMode: false,                           // export file paths instead of triggers (debug)
});
```

Returns the populated `exports` object (also mutated in-place).

### `exportFunctionsAsync(config)` — async, ESM-compatible

Identical config shape. Uses dynamic `import()` instead of `require()`. Use this for ESM function files or from an ESM entry point.

```typescript
// ESM entry point (e.g. index.mjs or package.json "type": "module")
import { exportFunctionsAsync } from 'better-firebase-functions';

const fns = await exportFunctionsAsync({
  __filename: import.meta.filename,
  exports: {},
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
});

export default fns;
```

### `discoverFunctionPaths(config)` — build-time discovery helper

Returns structured discovery metadata for bundler plugins. Most users do not call this directly.

```typescript
import { discoverFunctionPaths } from 'better-firebase-functions';

const discovery = discoverFunctionPaths({
  __filename: entryPointPath,
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
});

// discovery.entries: Record<funcName, { absPath, sourceRelativePath, runtimeRelativePath, outputRelativePath, outputEntryName }>
```

---

## Configuration Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `__filename` | `string` | — | **Required.** Node's `__filename` (or `import.meta.filename` in ESM) |
| `exports` | `object` | — | **Required.** Node's `exports` / `module.exports` |
| `functionDirectoryPath` | `string` | `'./'` | Directory containing function files, relative to entry point |
| `searchGlob` | `string` | `'**/*.{js,ts}'` | Glob pattern matching trigger files at runtime |
| `funcNameFromRelPath` | `function` | built-in | Custom function name generator — `(relPath: string) => string` |
| `extractTrigger` | `function` | `(mod) => mod?.default` | Extract trigger from loaded module |
| `__dirname` | `string` | derived from `__filename` | Override discovery base directory |
| `enableLogger` | `boolean` | `false` | Print performance timing logs |
| `logger` | `object` | `console` | Custom logger with `time`, `timeEnd`, `log` methods |
| `exportPathMode` | `boolean` | `false` | Export file paths instead of triggers (debugging / build tools) |

---

## Bundler Plugins

Bundler plugins take the optimization further: they produce **one independently bundled, tree-shaken file per function**. On cold start, Node.js parses only the code that specific function needs — no dead code from unrelated functions.

### The single-source-of-truth design

The plugins execute your BFF entry point in build-discovery mode (`BFF_BUILD_DISCOVERY=1`) to reuse the exact same `functionDirectoryPath`, `searchGlob`, and `funcNameFromRelPath` already configured for runtime. You write your BFF config once, in the entry point. The bundler inherits it automatically.

Your runtime `searchGlob` can target `.js` files — the plugins automatically expand it to match `.ts` source files at build time.

### Output layout

Bundled outputs preserve the `functionDirectoryPath` and mirror the runtime file layout:

```
src/functions/auth/on-create.func.ts  →  dist/functions/auth/on-create.func.js
src/functions/http/get-user.func.ts   →  dist/functions/http/get-user.func.js
```

The deployed `main.js` uses the same `functionDirectoryPath` and `searchGlob` — no mismatch between build and runtime.

### esbuild

```sh
npm install -D better-firebase-functions-esbuild esbuild
```

```typescript
import { buildFunctions } from 'better-firebase-functions-esbuild';
import { resolve } from 'path';

await buildFunctions({
  entryPoint: resolve(__dirname, 'src/index.ts'),
  outdir: resolve(__dirname, 'dist'),
  target: 'node20',
});
```

→ Full docs: [`packages/esbuild/README.md`](./packages/esbuild/README.md)

### webpack

```sh
npm install -D better-firebase-functions-webpack webpack
```

```typescript
// webpack.config.ts
import { BffWebpackPlugin } from 'better-firebase-functions-webpack';

export default {
  target: 'node',
  entry: 'src/index.ts',
  plugins: [
    new BffWebpackPlugin({
      entryPoint: resolve(__dirname, 'src/index.ts'),
    }),
  ],
};
```

→ Full docs: [`packages/webpack/README.md`](./packages/webpack/README.md)

### Rollup

```sh
npm install -D better-firebase-functions-rollup rollup
```

```typescript
// rollup.config.ts
import { bffRollupPlugin, bffRollupOutput } from 'better-firebase-functions-rollup';

export default {
  input: 'src/index.ts',
  output: bffRollupOutput({ dir: 'dist' }),
  plugins: [bffRollupPlugin({ entryPoint: resolve(__dirname, 'src/index.ts') })],
};
```

→ Full docs: [`packages/rollup/README.md`](./packages/rollup/README.md)

---

## Common Patterns

### Custom file suffix convention

```typescript
exportFunctions({
  __filename,
  exports,
  searchGlob: '**/*.trigger.js', // only files ending in .trigger.js
});
```

### Custom function name generator

```typescript
import { exportFunctions } from 'better-firebase-functions';
import { basename } from 'path';

exportFunctions({
  __filename,
  exports,
  // Flat names — no group prefix — all functions at top level
  funcNameFromRelPath: (relPath) => basename(relPath).replace(/\.(func\.)?(js|ts)$/, ''),
});
```

### Named export instead of default

```typescript
exportFunctions({
  __filename,
  exports,
  extractTrigger: (mod) => mod?.handler ?? mod?.default,
});
```

### ESM entry point with top-level await

```typescript
// index.mjs
import { exportFunctionsAsync } from 'better-firebase-functions';

export default await exportFunctionsAsync({
  __filename: import.meta.filename,
  exports: {},
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
});
```

### Co-located test files — keep them out

Use a specific glob pattern that excludes test files:

```typescript
exportFunctions({
  __filename,
  exports,
  searchGlob: '**/*.func.js', // .test.js and .spec.js are not matched
});
```

---

## Environment Variables (Read by BFF)

| Variable | Source | Priority | Notes |
|---|---|---|---|
| `FUNCTION_TARGET` | Functions Framework (Gen 2) | 1st | Most precise — exact registered function name |
| `FUNCTION_NAME` | Firebase Gen 1, some Gen 2 | 2nd | May be a full resource path — last segment extracted |
| `K_SERVICE` | Cloud Run (Gen 2) | 3rd | Lowercased by Cloud Run — canonicalized before matching |
| `BFF_BUILD_DISCOVERY` | Bundler plugins | — | Set to `1` during build-time discovery; skips loading modules |

When none of the function-identity variables are set, BFF is in deployment mode and loads all modules.

---

## Troubleshooting

**Functions are not discovered (empty exports)**

1. Check your `searchGlob` matches the compiled files. If you use `tsc`, globs for `.ts` won't find anything at runtime — use `.js`.
2. Set `enableLogger: true` to see which files the glob finds at startup.
3. Check `functionDirectoryPath` is correct relative to your entry point.

**`Function 'x' is not defined in the provided module` on Gen 2**

BFF's name matching failed. The most common causes:
- The derived function name does not match what Cloud Run lowercases as `K_SERVICE`.
- You use a custom `funcNameFromRelPath` whose output doesn't canonicalize to the Cloud Run service name.

Enable logger to see what name BFF is searching for vs. what the env var contains.

**Bundler plugin throws `did not expose __bff_discovery`**

BFF's entry-point execution mode requires `tsx` to be able to require TypeScript files. Either:
1. Add `tsx` as a devDependency in your bundler package
2. Fall back to manual discovery overrides:

```typescript
new BffWebpackPlugin({
  entryPoint: resolve(__dirname, 'src/index.ts'),
  // Manual fallback:
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
})
```

---

## Requirements

- Node.js ≥ 20
- Firebase Functions Gen 1 or Gen 2
- CJS modules for `exportFunctions`; ESM supported via `exportFunctionsAsync`
- `tsx` as a dev dependency if using bundler plugins with TypeScript entry points

---

## Contributing

This is a Turborepo monorepo with npm workspaces.

```sh
git clone https://github.com/george43g/better-firebase-functions
npm install
npm run build   # build all packages
npm test        # run all tests
npm run lint    # type-check all packages
```

Core library tests: `packages/core/__tests__/`

E2E benchmarks against a real Firebase project:

```sh
PROJECT_ID=your-project-id ./e2e/run-deploy-benchmark.sh
```

---

## License

[MPL-2.0](./LICENSE)
