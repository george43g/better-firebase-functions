# better-firebase-functions-rollup

**Rollup plugin for optimized Firebase Cloud Functions builds.**

[![npm](https://img.shields.io/npm/v/better-firebase-functions-rollup)](https://www.npmjs.com/package/better-firebase-functions-rollup)

Part of the [`better-firebase-functions`](https://github.com/george43g/better-firebase-functions) monorepo.

---

## Why?

The core `better-firebase-functions` library reduces cold-start time by only loading the one function module that matches the running instance at runtime. The Rollup plugin takes this further: each function gets its own **independently bundled, tree-shaken output file**. On cold start, Node.js parses only a small, tight bundle with exactly the code that function needs.

---

## Installation

```sh
npm install --save-dev better-firebase-functions-rollup rollup
```

---

## Usage

```typescript
// rollup.config.ts
import { resolve } from 'path';
import { bffRollupPlugin, bffRollupOutput } from 'better-firebase-functions-rollup';

export default {
  input: resolve(__dirname, 'src/index.ts'),

  output: bffRollupOutput({
    dir: resolve(__dirname, 'dist'),
    mainFileName: 'main.js',
    format: 'cjs',
  }),

  plugins: [
    bffRollupPlugin({
      entryPoint: resolve(__dirname, 'src/index.ts'),
      functionDirectoryPath: './functions',
      searchGlob: '**/*.func.ts',
      verbose: true,
    }),
    // Add your TypeScript plugin, node-resolve, etc. here
  ],

  external: ['firebase-admin', 'firebase-functions'],
};
```

**Output layout:**

```
dist/
  main.js            ← entry point
  auth/
    onCreate.js      ← auth-onCreate function, independently bundled
  http/
    getUser.js       ← http-getUser function, independently bundled
```

---

## API

### `bffRollupPlugin(options)`

Returns a Rollup `Plugin`. Discovers function files at build start and emits each as an additional chunk.

| Option | Type | Default | Description |
|---|---|---|---|
| `entryPoint` | `string` | — | **Required.** Absolute path to your entry point (`index.ts`) |
| `functionDirectoryPath` | `string` | `'./'` | Relative path from entry point to functions directory |
| `searchGlob` | `string` | `'**/*.{js,ts}'` | Glob pattern for function files |
| `funcNameFromRelPath` | `function` | built-in | Custom function name generator |
| `verbose` | `boolean` | `false` | Log discovered entry points |

### `bffRollupOutput(options)`

Returns a Rollup `OutputOptions` object configured for Firebase Functions output.

| Option | Type | Default | Description |
|---|---|---|---|
| `dir` | `string` | — | **Required.** Output directory |
| `mainFileName` | `string` | `'main.js'` | Output filename for the main/index chunk |
| `format` | `'cjs' \| 'esm'` | `'cjs'` | Output module format |

This helper configures `entryFileNames` to convert dash-separated function names (e.g. `auth-onCreate`) to directory-nested paths (e.g. `auth/onCreate.js`).

---

## How It Works

1. At build start, the plugin calls `exportFunctions({ exportPathMode: true })` to discover function file paths using BFF's glob logic — without loading any modules.
2. It calls `this.emitFile({ type: 'chunk', id: path, name: funcName })` for each discovered function, injecting them as additional Rollup entry points.
3. Rollup bundles each function independently, applying tree shaking across each chunk.
4. `bffRollupOutput` routes the output to the correct nested directory structure.
5. At runtime, the BFF cold-start optimization still applies — only the matching module is loaded from the pre-bundled output.

---

## Requirements

- Node.js ≥ 18
- Rollup ≥ 3.0.0 (peer dependency)
- `better-firebase-functions` (installed automatically as a dependency)
