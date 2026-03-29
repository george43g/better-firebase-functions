# better-firebase-functions-esbuild

esbuild helper/plugin for `better-firebase-functions`.

This package discovers your Firebase function files using the same config already present in your BFF entry point, then builds one bundled output file per function.

## Install

```sh
npm install -D better-firebase-functions-esbuild esbuild
```

## How discovery works

The plugin executes your entry point in a special BFF build-discovery mode. That means it reuses the exact runtime config already passed to `exportFunctions()` or `exportFunctionsAsync()`:

- `functionDirectoryPath`
- `searchGlob`
- `funcNameFromRelPath`
- `__dirname`

In the common case you only provide `entryPoint` to the build helper. No duplicated glob config is required.

## Recommended usage: `buildFunctions()`

Keep your runtime config in the entry point:

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

Then build with esbuild:

```typescript
import { buildFunctions } from 'better-firebase-functions-esbuild';
import { resolve } from 'path';

await buildFunctions({
  entryPoint: resolve(__dirname, 'src/index.ts'),
  outdir: resolve(__dirname, 'dist'),
  target: 'node20',
  verbose: true,
});
```

### Output layout

If the source trigger is:

```text
src/functions/auth/on-create.func.ts
```

...the bundled output will be:

```text
dist/main.js
dist/functions/auth/on-create.func.js
```

The runtime layout is preserved, so `main.js` can keep using the same `functionDirectoryPath` and `searchGlob` you configured in the entry point.

## Manual discovery helpers

### `discoverFunctionEntryPoints()`

Returns a runtime-oriented map of `{ functionName: absoluteSourcePath }`.

```typescript
import { discoverFunctionEntryPoints } from 'better-firebase-functions-esbuild';

const entryPoints = await discoverFunctionEntryPoints({
  entryPoint: resolve(__dirname, 'src/index.ts'),
});
```

### `discoverBuildEntryPoints()`

Returns build-ready esbuild entry points whose output paths already mirror the runtime BFF layout.

```typescript
import { discoverBuildEntryPoints } from 'better-firebase-functions-esbuild';

const { entryPoints, discovery } = await discoverBuildEntryPoints({
  entryPoint: resolve(__dirname, 'src/index.ts'),
});

await esbuild.build({
  entryPoints: {
    main: resolve(__dirname, 'src/index.ts'),
    ...entryPoints,
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
});
```

## Logging plugin: `bffEsbuildPlugin()`

esbuild's plugin API cannot add entry points dynamically, so the plugin only logs discovery information. Use `buildFunctions()` for actual per-function bundling.

```typescript
import { build } from 'esbuild';
import { bffEsbuildPlugin } from 'better-firebase-functions-esbuild';

await build({
  entryPoints: { main: 'src/index.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  plugins: [
    bffEsbuildPlugin({
      entryPoint: resolve(__dirname, 'src/index.ts'),
      verbose: true,
    }),
  ],
});
```

## Fallback manual overrides

If your entry point cannot be executed directly during the build, you can still pass discovery overrides manually:

```typescript
await buildFunctions({
  entryPoint: resolve(__dirname, 'src/index.ts'),
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
  funcNameFromRelPath: myCustomNameGenerator,
  outdir: 'dist',
});
```

These overrides are a fallback only. The preferred approach is keeping the discovery config in the entry point and letting the plugin load it automatically.

## Notes

- Your `searchGlob` should describe runtime files, usually compiled `.js` files.
- During build-discovery, BFF automatically expands `.js` / `.cjs` / `.mjs` globs to match source `.ts` / `.cts` / `.mts` files too.
- If you use a custom `funcNameFromRelPath`, esbuild discovery reuses it automatically because it is loaded from the entry point itself.
