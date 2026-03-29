# better-firebase-functions-rollup

Rollup plugin for `better-firebase-functions`.

This plugin discovers your Firebase function files using the same config already present in your BFF entry point, then emits one bundled chunk per function.

## Install

```sh
npm install -D better-firebase-functions-rollup rollup
```

## How discovery works

The plugin executes your entry point in a special BFF build-discovery mode. That means it reuses the exact runtime config already passed to `exportFunctions()` or `exportFunctionsAsync()`:

- `functionDirectoryPath`
- `searchGlob`
- `funcNameFromRelPath`
- `__dirname`

In the common case you only provide `entryPoint` to the plugin. No duplicated glob config is required.

## Usage

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

Then configure Rollup:

```typescript
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
      verbose: true,
    }),
  ],
};
```

## Output layout

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

## API

### `bffRollupPlugin(options)`

| Option | Description |
|---|---|
| `entryPoint` | Required entry point path used for build-discovery |
| `verbose` | Logs discovered functions and output paths |
| `__dirname` / `functionDirectoryPath` / `searchGlob` / `funcNameFromRelPath` | Fallback manual discovery overrides |

### `bffRollupOutput(options)`

Returns a Rollup `output` config that preserves the runtime BFF layout for bundled triggers.

## Fallback manual overrides

If your entry point cannot be executed directly during the build, you can still pass discovery overrides manually:

```typescript
bffRollupPlugin({
  entryPoint: resolve(__dirname, 'src/index.ts'),
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
  funcNameFromRelPath: myCustomNameGenerator,
})
```

These overrides are a fallback only. The preferred approach is keeping the discovery config in the entry point and letting the plugin load it automatically.

## Notes

- Your `searchGlob` should describe runtime files, usually compiled `.js` files.
- During build-discovery, BFF automatically expands `.js` / `.cjs` / `.mjs` globs to match source `.ts` / `.cts` / `.mts` files too.
- Output filenames now mirror the runtime BFF layout instead of being reconstructed from dash-separated function names.
