# better-firebase-functions-esbuild

**esbuild plugin and build helper for optimized Firebase Cloud Functions.**

[![npm](https://img.shields.io/npm/v/better-firebase-functions-esbuild)](https://www.npmjs.com/package/better-firebase-functions-esbuild)

Part of the [`better-firebase-functions`](https://github.com/george43g/better-firebase-functions) monorepo.

---

## Why?

The core `better-firebase-functions` library reduces cold-start time by only loading the one function module that matches the running instance at runtime. This is already a significant improvement.

The bundler plugins take this further: instead of one large bundle containing all your functions' code, each function gets its own **independently bundled, tree-shaken file**. On cold start, Node.js only has to parse and execute a small, tight bundle with exactly the code that function needs — no dead code, no shared initialization from unrelated functions.

---

## Installation

```sh
npm install --save-dev better-firebase-functions-esbuild esbuild
```

---

## Usage

### Option A: `buildFunctions()` (recommended)

The simplest integration. Call it from a build script and it handles everything.

```typescript
// scripts/build.ts
import { buildFunctions } from 'better-firebase-functions-esbuild';
import { resolve } from 'path';

await buildFunctions({
  entryPoint: resolve(__dirname, '../src/index.ts'),
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.ts',
  outdir: resolve(__dirname, '../dist'),
  target: 'node20',
  verbose: true,
});
```

This produces one output file per function in `dist/`, plus a `dist/main.js` for the entry point. Each function file is independently bundled with tree shaking.

**Output layout:**

```
dist/
  main.js           ← entry point (loads BFF, discovers functions at runtime)
  auth/
    onCreate.js     ← auth-onCreate function, independently bundled
  http/
    getUser.js      ← http-getUser function, independently bundled
```

### Option B: `discoverFunctionEntryPoints()` + manual esbuild call

For full control over the esbuild configuration:

```typescript
import { build } from 'esbuild';
import { discoverFunctionEntryPoints } from 'better-firebase-functions-esbuild';
import { resolve } from 'path';

const entryPoint = resolve(__dirname, 'src/index.ts');

const functionEntries = discoverFunctionEntryPoints({
  entryPoint,
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.ts',
});

await build({
  entryPoints: {
    main: entryPoint,
    ...functionEntries,
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  treeShaking: true,
  external: ['firebase-admin', 'firebase-functions'],
  // ... any other esbuild options
});
```

### Option C: `bffEsbuildPlugin()` (informational only)

The plugin logs discovered entry points during an esbuild build. Note: esbuild's plugin API does not support dynamically adding entry points, so this is for monitoring/logging purposes only. Use `discoverFunctionEntryPoints()` to set up entry points, then add the plugin for visibility.

```typescript
import { build } from 'esbuild';
import { discoverFunctionEntryPoints, bffEsbuildPlugin } from 'better-firebase-functions-esbuild';

const entryPoints = discoverFunctionEntryPoints({ entryPoint: 'src/index.ts' });

await build({
  entryPoints: { main: 'src/index.ts', ...entryPoints },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  plugins: [bffEsbuildPlugin({ entryPoint: 'src/index.ts', verbose: true })],
});
```

---

## API

### `buildFunctions(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `entryPoint` | `string` | — | **Required.** Absolute path to your entry point (`index.ts`) |
| `outdir` | `string` | — | **Required.** Output directory |
| `functionDirectoryPath` | `string` | `'./'` | Relative path from entry point to functions directory |
| `searchGlob` | `string` | `'**/*.{js,ts}'` | Glob pattern for function files |
| `funcNameFromRelPath` | `function` | built-in | Custom function name generator |
| `external` | `boolean \| string[]` | `true` | Dependencies to externalize. `true` reads from `package.json` |
| `target` | `string` | `'node18'` | esbuild Node.js target |
| `verbose` | `boolean` | `false` | Log discovered entry points |
| `esbuildOptions` | `Partial<BuildOptions>` | `{}` | Additional esbuild options (merged) |

### `discoverFunctionEntryPoints(options)`

Returns `Record<string, string>` — a map of `{ functionName: absoluteFilePath }`.

### `bffEsbuildPlugin(options)`

Returns an esbuild `Plugin` for logging. See Option C above.

---

## How It Works

1. At build time, `discoverFunctionEntryPoints()` calls `exportFunctions({ exportPathMode: true })` which runs the BFF glob discovery logic but returns **file paths** instead of loading modules.
2. Those paths are passed to esbuild as individual entry points.
3. esbuild bundles each function file independently, applying tree shaking.
4. At runtime, the BFF cold-start optimization still applies — only the matching module is loaded. Because each module is now its own small bundle, startup is even faster.

---

## Requirements

- Node.js ≥ 18
- esbuild ≥ 0.17.0 (peer dependency)
- `better-firebase-functions` (installed automatically as a dependency)
