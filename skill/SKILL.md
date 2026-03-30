---
name: better-firebase-functions
description: |
  Expert knowledge for implementing better-firebase-functions in a Firebase Cloud Functions project. Use this skill when a user wants to: add cold-start optimization to Firebase Functions, set up automatic function discovery and export, configure bundler plugins (esbuild/webpack/rollup) for per-function bundles, migrate from manual imports to BFF's auto-export pattern, or troubleshoot BFF configuration. Covers Gen 1, Gen 2, CJS and ESM setups.
---

# better-firebase-functions skill

This skill provides complete knowledge for implementing and configuring `better-firebase-functions` (BFF) in any Firebase Cloud Functions project.

## What BFF does

BFF replaces manual function imports with automatic discovery + cold-start optimization. Without BFF, every function module loads on every cold start. With BFF, only the one module matching the currently-invoked function loads.

**Runtime behaviour at a glance:**

- `FUNCTION_TARGET` / `FUNCTION_NAME` / `K_SERVICE` set → cold-start mode: load one matching module only
- None set → deployment mode: load all modules so Firebase CLI can discover triggers
- `BFF_BUILD_DISCOVERY=1` set → build-discovery mode: scan files, return metadata, load zero modules

---

## Installation

```sh
# Core library (always required)
npm install better-firebase-functions

# Optional bundler plugins (pick one or none)
npm install -D better-firebase-functions-esbuild esbuild
npm install -D better-firebase-functions-webpack webpack
npm install -D better-firebase-functions-rollup rollup
```

---

## Entry point setup

The entry point is the **single source of truth** for all BFF configuration. Write it once — the bundler plugins inherit it automatically.

### CJS (most common)

```typescript
// src/index.ts
import { exportFunctions } from 'better-firebase-functions';

exportFunctions({
  __filename,
  exports,
  functionDirectoryPath: './functions',  // relative to src/index.ts
  searchGlob: '**/*.func.js',            // matches compiled .js files at runtime
});
```

### ESM

```typescript
// src/index.mjs
import { exportFunctionsAsync } from 'better-firebase-functions';

export default await exportFunctionsAsync({
  __filename: import.meta.filename,
  exports: {},
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
});
```

---

## Function file structure

Each trigger file exports its trigger as the **default export**:

```typescript
// src/functions/auth/on-create.func.ts
import { auth } from 'firebase-functions';

export default auth.user().onCreate(async (user) => {
  console.log('new user', user.uid);
});
```

```typescript
// src/functions/http/get-user.func.ts
import { onRequest } from 'firebase-functions/v2/https';

export default onRequest(async (req, res) => {
  res.json({ ok: true });
});
```

**Naming rules** (default, customizable):

| File path | Firebase function name |
|---|---|
| `functions/on-create.func.ts` | `onCreate` |
| `functions/auth/on-create.func.ts` | `auth-onCreate` |
| `functions/http/get-user.func.ts` | `http-getUser` |
| `functions/http/api/list-users.func.ts` | `http-api-listUsers` |

Dashes create Firebase **function groups**, enabling `firebase deploy --only functions:auth`.

---

## searchGlob convention

The glob must match files **as they exist at runtime** (after TypeScript compilation):

```typescript
// ✅ Correct — matches compiled .js files at runtime
searchGlob: '**/*.func.js'

// ✅ Also fine — if you use tsx / ts-node at runtime
searchGlob: '**/*.func.ts'

// ✅ BFF defaults — matches both
searchGlob: '**/*.{js,ts}'
```

When bundler plugins are used, BFF automatically expands `.js` → `.{js,ts}` so build-time discovery finds TypeScript source files. The runtime glob remains `.js`.

---

## tsconfig / build setup

Typical `tsconfig.json` for a Firebase project using BFF:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "lib",
    "rootDir": "src",
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["lib", "node_modules"]
}
```

With `outDir: "lib"` and `rootDir: "src"`, your `firebase.json` should point to `lib/index.js` and `package.json#main` should be `lib/index.js`.

---

## Configuration options

All options are optional except `__filename` and `exports`.

| Option | Type | Default | Description |
|---|---|---|---|
| `__filename` | `string` | — | **Required.** Node's `__filename` |
| `exports` | `object` | — | **Required.** Node's `exports` / `module.exports` |
| `functionDirectoryPath` | `string` | `'./'` | Directory of trigger files, relative to entry point |
| `searchGlob` | `string` | `'**/*.{js,ts}'` | Glob matching trigger files at runtime |
| `funcNameFromRelPath` | `function` | built-in | Custom name generator: `(relPath: string) => string` |
| `extractTrigger` | `function` | `mod?.default` | Extract trigger from loaded module |
| `__dirname` | `string` | derived from `__filename` | Override base directory for discovery |
| `enableLogger` | `boolean` | `false` | Log discovery and module-load timing |
| `logger` | `object` | `console` | Custom logger with `time`, `timeEnd`, `log` |
| `exportPathMode` | `boolean` | `false` | Export file paths instead of triggers (debugging) |

---

## Bundler plugin setup (optional, takes optimization further)

Bundler plugins produce one independently bundled file per function. No duplicate config is needed — the plugin executes the entry point in build-discovery mode and inherits all settings.

### esbuild (recommended for simplicity)

```typescript
// build.ts (run with: npx tsx build.ts)
import { buildFunctions } from 'better-firebase-functions-esbuild';
import { resolve } from 'path';

await buildFunctions({
  entryPoint: resolve(__dirname, 'src/index.ts'),
  outdir: resolve(__dirname, 'lib'),
  target: 'node20',
  // external: true  ← default: auto-reads from package.json
});
```

Add to `package.json`:

```json
{
  "scripts": {
    "build": "tsx build.ts"
  }
}
```

### webpack

```typescript
// webpack.config.ts
import { resolve } from 'path';
import { BffWebpackPlugin } from 'better-firebase-functions-webpack';

export default {
  target: 'node',
  mode: 'production',
  entry: resolve(__dirname, 'src/index.ts'),
  output: {
    path: resolve(__dirname, 'lib'),
    libraryTarget: 'commonjs2',
  },
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }],
  },
  plugins: [
    new BffWebpackPlugin({
      entryPoint: resolve(__dirname, 'src/index.ts'),
    }),
  ],
};
```

### Rollup

```typescript
// rollup.config.ts
import { resolve } from 'path';
import { bffRollupPlugin, bffRollupOutput } from 'better-firebase-functions-rollup';

export default {
  input: resolve(__dirname, 'src/index.ts'),
  output: bffRollupOutput({ dir: resolve(__dirname, 'lib') }),
  external: ['firebase-admin', 'firebase-functions'],
  plugins: [
    bffRollupPlugin({ entryPoint: resolve(__dirname, 'src/index.ts') }),
  ],
};
```

### Fallback: manual discovery overrides

If the entry point cannot be executed by `tsx` at build time, pass overrides manually:

```typescript
new BffWebpackPlugin({
  entryPoint: resolve(__dirname, 'src/index.ts'),
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
  funcNameFromRelPath: myCustomNamer,
})
```

---

## Custom naming functions

If the default `funcNameFromRelPathDefault` does not fit your structure, pass a custom function. **Important:** the same function must be used at runtime (in the entry point) and at build time (the plugin inherits it from the entry point automatically).

```typescript
// Example: all functions at top level, no group prefix
exportFunctions({
  __filename,
  exports,
  funcNameFromRelPath: (relPath) => {
    const filename = path.basename(relPath);
    return filename.replace(/\.(func\.)?(js|ts)$/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  },
});
```

---

## Common pitfalls

### searchGlob targets `.ts` but runtime compiled output is `.js`

**Symptom:** Functions deploy fine but are empty / not registered at runtime.

**Fix:** Use `**/*.func.js` (or whatever compiled extension), not `.ts`, in `searchGlob`. If using `tsx`/`ts-node` in production, `.ts` is fine.

### Custom `funcNameFromRelPath` in entry point but not in bundler config

**This is no longer an issue** with the current build-discovery approach — the plugin executes the entry point and inherits the same function. But if you fall back to manual overrides, make sure both sides match.

### Gen 2 / Cloud Run: `Function 'x' is not defined in the provided module`

Cloud Run lowercases service names. BFF canonicalizes both sides before comparing, so this should be handled automatically. If you still see this error:

1. Check `FUNCTION_TARGET` is being set by the Functions Framework (it takes precedence)
2. Set `enableLogger: true` and check which name BFF is searching for

### Bundler plugin: `did not expose __bff_discovery`

BFF needs `tsx` to require the TypeScript entry point at build time. Install it:

```sh
npm install -D tsx
```

Or pass manual overrides as a fallback (see above).

---

## Environment variables (read by BFF)

| Variable | When set | BFF behaviour |
|---|---|---|
| `FUNCTION_TARGET` | Gen 2 / Functions Framework | Load the single module whose derived name matches |
| `FUNCTION_NAME` | Gen 1, some Gen 2 | Same as above; last path segment extracted if full resource path |
| `K_SERVICE` | Cloud Run (Gen 2) | Same as above; case-normalized before matching |
| none of the above | During `firebase deploy` | Load all modules (deployment mode) |
| `BFF_BUILD_DISCOVERY=1` | Set by bundler plugins | Scan files, register discovery metadata, load zero modules |

---

## Verification checklist

Before deploying, verify:

- [ ] `__filename` and `exports` are passed to `exportFunctions()`
- [ ] `searchGlob` matches compiled output (`.js`) unless running TypeScript natively
- [ ] Each trigger file has `export default <trigger>`
- [ ] `functionDirectoryPath` is correct relative to the entry point
- [ ] If using a bundler plugin: entry point can be required by `tsx`, or manual overrides are provided
- [ ] `firebase.json` `source` points to the directory containing `package.json` for the functions codebase
- [ ] `package.json#main` in the functions directory points to the compiled entry point

---

## Example directory layout

```
my-firebase-project/
  functions/
    src/
      index.ts                           ← entry point (exportFunctions call here)
      functions/
        auth/
          on-create.func.ts              ← exports as auth-onCreate
          on-delete.func.ts              ← exports as auth-onDelete
        http/
          get-user.func.ts               ← exports as http-getUser
          create-user.func.ts            ← exports as http-createUser
        payments/
          process-webhook.func.ts        ← exports as payments-processWebhook
    lib/                                 ← compiled output (tsc outDir)
    package.json
    tsconfig.json
  firebase.json
```

`firebase.json`:

```json
{
  "functions": {
    "source": "functions"
  }
}
```

`functions/package.json`:

```json
{
  "main": "lib/index.js",
  "engines": { "node": "20" },
  "dependencies": {
    "better-firebase-functions": "^7.0.0",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^6.0.0"
  }
}
```
