# better-firebase-functions-webpack

**webpack plugin for optimized Firebase Cloud Functions builds.**

[![npm](https://img.shields.io/npm/v/better-firebase-functions-webpack)](https://www.npmjs.com/package/better-firebase-functions-webpack)

Part of the [`better-firebase-functions`](https://github.com/george43g/better-firebase-functions) monorepo.

---

## Why?

The core `better-firebase-functions` library reduces cold-start time by only loading the one function module that matches the running instance at runtime. The webpack plugin takes this further: each function gets its own **independently bundled, tree-shaken output file**. On cold start, Node.js parses only a small, tight bundle with exactly the code that function needs.

---

## Installation

```sh
npm install --save-dev better-firebase-functions-webpack webpack
```

---

## Usage

Add `BffWebpackPlugin` to your webpack config. The plugin automatically discovers your function files and configures webpack to build each one as a separate entry point.

```typescript
// webpack.config.ts
import { resolve } from 'path';
import { BffWebpackPlugin } from 'better-firebase-functions-webpack';

export default {
  target: 'node',
  mode: 'production',
  entry: resolve(__dirname, 'src/index.ts'),
  output: {
    path: resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new BffWebpackPlugin({
      entryPoint: resolve(__dirname, 'src/index.ts'),
      functionDirectoryPath: './functions',
      searchGlob: '**/*.func.ts',
      verbose: true,
    }),
  ],
};
```

**Output layout:**

```
dist/
  main.js            ← entry point (per outputFileName option)
  auth/
    onCreate.js      ← auth-onCreate function, independently bundled
  http/
    getUser.js       ← http-getUser function, independently bundled
```

---

## API

### `new BffWebpackPlugin(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `entryPoint` | `string` | — | **Required.** Absolute path to your entry point (`index.ts`) |
| `functionDirectoryPath` | `string` | `'./'` | Relative path from entry point to functions directory |
| `searchGlob` | `string` | `'**/*.{js,ts}'` | Glob pattern for function files |
| `funcNameFromRelPath` | `function` | built-in | Custom function name generator |
| `outputFileName` | `string` | `'main.js'` | Output filename for the main entry point |
| `verbose` | `boolean` | `false` | Log discovered entry points |

---

## How It Works

1. At build time, the plugin calls `exportFunctions({ exportPathMode: true })` to discover function file paths using BFF's glob logic — without loading any modules.
2. It hooks into webpack's `environment` phase to inject those paths as additional entry points.
3. It configures webpack's `output.filename` to route function entries into the correct directory paths (dash-separated names → nested directories).
4. webpack bundles each function independently with tree shaking.
5. At runtime, the BFF cold-start optimization still applies — only the matching module is loaded from the pre-bundled output.

---

## Requirements

- Node.js ≥ 18
- webpack ≥ 5.0.0 (peer dependency)
- `better-firebase-functions` (installed automatically as a dependency)
