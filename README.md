# better-firebase-functions

Automatically export Firebase Cloud Functions with cold-start optimization built in.

`better-firebase-functions` replaces the boilerplate of manually importing and exporting every trigger with a single call. At runtime it only loads the single function module that matches the current invocation, instead of loading every module in your project on every cold start.

## Packages

| Package | Description |
|---|---|
| [`better-firebase-functions`](./packages/core) | Core runtime library |
| [`better-firebase-functions-esbuild`](./packages/esbuild) | esbuild helper/plugin for per-function bundles |
| [`better-firebase-functions-webpack`](./packages/webpack) | webpack plugin for per-function bundles |
| [`better-firebase-functions-rollup`](./packages/rollup) | Rollup plugin for per-function bundles |

## Quick start

Install the core package:

```sh
npm install better-firebase-functions
```

Create a minimal entry point:

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

Write each trigger as a default export:

```typescript
// src/functions/http/get-user.func.ts
import { onRequest } from 'firebase-functions/v2/https';

export default onRequest((req, res) => {
  res.json({ ok: true });
});
```

That file is exported as `http-getUser`.

## Why it helps

Without BFF, your entry point imports every function module eagerly. If your project has 50 functions, every cold start pays the cost of loading all 50 modules plus their dependencies.

With BFF, the entry point checks the current runtime env (`FUNCTION_TARGET`, `FUNCTION_NAME`, `K_SERVICE`) and loads only the single module that matches the running function.

During deployment, BFF still loads all triggers so Firebase can discover them.

## Bundler plugins

The bundler plugins take the same idea further by producing one bundled output file per function.

### Zero duplicated config

The plugins execute your BFF entry point in a special build-discovery mode. That means they automatically reuse the exact same:

- `functionDirectoryPath`
- `searchGlob`
- `funcNameFromRelPath`
- `__dirname` override

...that you already configured in `exportFunctions()`.

In the common case, the plugin only needs your `entryPoint` path. You do not need to repeat your glob strategy in your bundler config.

### Runtime globs vs source files

Your `searchGlob` should still describe the files that exist at runtime after compilation, usually `**/*.func.js`.

During bundler build-discovery, BFF automatically expands JavaScript globs to match source TypeScript files too:

- `**/*.func.js` -> matches source `**/*.func.ts` during the build
- `**/*.func.cjs` -> matches source `**/*.func.cts`
- `**/*.func.mjs` -> matches source `**/*.func.mts`

That keeps one source of truth for both runtime and build-time discovery.

### Output structure

Bundled trigger files now mirror the runtime layout BFF expects.

For example, if your entry point uses:

```typescript
exportFunctions({
  __filename,
  exports,
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
});
```

...and the source file is:

```text
src/functions/auth/on-create.func.ts
```

...the bundled output will be:

```text
dist/main.js
dist/functions/auth/on-create.func.js
```

That means the runtime `main.js` can keep using the same `functionDirectoryPath` and `searchGlob` without any special-case build config.

## API

### `exportFunctions(config)`

Synchronous CJS API for most Firebase projects.

```typescript
import { exportFunctions } from 'better-firebase-functions';

exportFunctions({
  __filename,
  exports,
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
  funcNameFromRelPath: undefined,
  extractTrigger: (mod) => mod?.default,
  enableLogger: false,
  logger: console,
});
```

### `exportFunctionsAsync(config)`

Async ESM-compatible version that uses dynamic `import()`.

### `discoverFunctionPaths(config)`

Advanced build helper that returns structured discovery metadata:

- absolute source path
- source relative path
- runtime relative path
- output relative path
- output entry name

The bundler plugins use this internally. Most users should not need it directly.

## Configuration reference

| Option | Description |
|---|---|
| `__filename` | Required entry point filename |
| `exports` | Required Node exports object |
| `__dirname` | Optional discovery root override |
| `functionDirectoryPath` | Relative path from the entry point to trigger files |
| `searchGlob` | Runtime file glob, usually matching compiled `.js` files |
| `funcNameFromRelPath` | Custom function name generator |
| `extractTrigger` | Custom trigger extractor from a loaded module |
| `enableLogger` / `logger` | Performance logging control |
| `exportPathMode` | Debug/helper mode that exports relative file paths instead of triggers |

## Notes

- Function groups are created by dashes in the generated function name, so `auth/on-create.func.ts` becomes `auth-onCreate`.
- If you customise `funcNameFromRelPath`, the bundler plugins will automatically reuse it when they load the entry point in build-discovery mode.
- If your entry point cannot be executed directly during the build, the bundler plugins still support manual discovery overrides as a fallback.

## Contributing

```sh
npm install
npm run build
npm test
```
