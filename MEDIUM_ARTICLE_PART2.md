# Medium Article Draft — Part 2
# "Optimizing Firebase Cloud Functions Cold Starts — Deeper, Measurable, Production-Proven"

> **How to use this draft:**
> Sections marked `[AUTHOR PROMPT]` are questions or cues for you to write from your own experience and perspective. Write as much or as little as feels right — these are the parts that make the article personal, credible, and genuinely interesting. Everything else is written for you. Feel free to reorder, cut, or extend any section.

---

## Introduction

*[Suggested subtitle: "From a single utility function to a full bundler ecosystem — and real cold-start numbers from a live Firebase project"]*

In [Part 1 of this series], we looked at a deceptively simple idea: instead of loading every Cloud Function module when your Firebase backend starts up, load only the one that's actually being called.

The implementation was small — under 100 lines of TypeScript. The impact was large.

Since then, a lot has changed in the Firebase Functions world. Gen 2 arrived, built on Cloud Run. The Node.js ecosystem shifted toward ESM. Bundlers became standard tools in serverless workflows. And the original package needed to keep up.

This is the story of v7: a ground-up rewrite, a new family of bundler plugins, a design breakthrough that eliminates an entire class of configuration bugs, and — for the first time — real cold-start numbers measured against a live Firebase project.

---

## Part 1: Why the rewrite was necessary

`[AUTHOR PROMPT]`
> **What was wrong with the older versions?**
> - What did v6 look like? What were its limitations?
> - Were there bug reports or edge cases you kept hitting? Gen 2 breakage? ESM issues?
> - Was there a specific moment where you decided a full rewrite was the right call, rather than patching?
> - How long had the package been sitting without meaningful updates before v7?

---

## Part 2: The cold-start optimization — how it actually works

For readers who didn't see Part 1, here's the core mechanism in plain terms.

When a Firebase Cloud Function cold-starts, Node.js executes your entry point (`index.js`). In a typical setup, that file imports every function module you've ever written:

```typescript
// The naive approach — every function pays the cost every time
import { onUserCreate } from './auth/on-create';
import { onUserDelete } from './auth/on-delete';
import { sendWelcomeEmail } from './email/send-welcome';
import { processPayment } from './payments/process';
// ... 40 more
```

When Firebase invokes `auth-onCreate`, the runtime still loads `processPayment`, `sendWelcomeEmail`, and every other module — their top-level code runs, their dependencies are resolved, their closures are formed. Only then does your handler execute.

With `better-firebase-functions`, the entry point becomes:

```typescript
import { exportFunctions } from 'better-firebase-functions';
exportFunctions({ __filename, exports });
```

At runtime, `exportFunctions()` checks the environment for the name of the currently-running function (`FUNCTION_NAME` on Gen 1, `K_SERVICE` on Gen 2, `FUNCTION_TARGET` from the Functions Framework). It then scans the functions directory via glob, but only `require()`s the single file whose derived name matches. Every other module is skipped entirely.

The optimization is purely subtractive. If there's one function in your project, the behavior is identical. If there are fifty, you get a 50x reduction in module-loading work.

---

## Part 3: Gen 2 changed the rules

When Firebase Gen 2 functions launched — backed by Cloud Run — the original implementation broke in a subtle way.

On Gen 1, the environment variable was `FUNCTION_NAME`, set to something like `auth-onCreate`. Simple.

On Gen 2, the equivalent is `K_SERVICE` — the Cloud Run service name. But Cloud Run lowercases service names: `auth-onCreate` becomes `authoncreate`. Matching `auth-onCreate` against `authoncreate` fails a naive string comparison.

The fix: canonicalize both sides before comparing. Strip everything that isn't alphanumeric, lowercase both strings.

```typescript
const canonicalize = (name: string) =>
  name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

// 'auth-onCreate' → 'authoncreate'
// 'authoncreate' → 'authoncreate'
// match ✓
```

But there was another wrinkle. The Functions Framework — the Node.js runtime that Gen 2 uses — also sets a `FUNCTION_TARGET` environment variable containing the exact entry-point name as registered. This is more specific than either `FUNCTION_NAME` or `K_SERVICE`. So the correct priority order is:

```typescript
const getFunctionInstance = (): string | undefined =>
  process.env.FUNCTION_TARGET   // Functions Framework — most precise
  || process.env.FUNCTION_NAME  // Gen 1, or full resource path on some Gen 2 runtimes
  || process.env.K_SERVICE      // Cloud Run service name (lowercased)
  || undefined;
```

For `FUNCTION_NAME` in some Gen 2 configurations, the value can be a full resource path like `projects/my-project/locations/us-central1/functions/auth-onCreate`. So we extract the last path segment before matching.

`[AUTHOR PROMPT]`
> **Did you discover the Gen 2 / K_SERVICE issue from user reports, or from testing your own projects? What was the debugging experience like? How long did it take to track down?**

---

## Part 4: The bundler plugin ecosystem

The core library solves the runtime problem. But there's a build-time counterpart that takes the optimization further.

### The problem bundlers solve

When you use `better-firebase-functions` without a bundler, your deployed functions directory still contains every function file. At cold start, only one is `require()`d — but Node.js still has to resolve the file path, stat the file system, read the file off disk, and parse the JavaScript source. For a small file this is milliseconds. For a large file with complex imports — `firebase-admin`, SDKs, business logic — it adds up.

With a bundler, you flip the problem. Instead of one entry point that dynamically selects one module from many, you produce **one pre-bundled file per function**. Each file contains only the exact code that function needs, tree-shaken from all shared modules.

At cold start, the runtime loads one small, tight file. No dynamic resolution, no redundant code paths, no shared initialization from unrelated functions.

### The configuration consistency problem

Before explaining how the plugins work, it's worth explaining a problem they needed to solve.

`better-firebase-functions` is highly configurable at runtime. You can pass a custom glob pattern, a custom function name generator, a custom base directory. That's deliberate — every project has a slightly different layout.

The original bundler plugin design accepted those same configuration options separately. But that meant two copies of the same config: one in your entry point for runtime, one in your webpack/esbuild/rollup config for build time. Any drift between the two would cause the build to bundle different files than the runtime would load — a silent, hard-to-debug mismatch.

### The breakthrough: the entry point is the single source of truth

The v7 bundler plugins take a different approach entirely. Instead of accepting duplicate config, they execute your BFF entry point directly — with a special environment variable set (`BFF_BUILD_DISCOVERY=1`) that tells BFF to run its discovery logic but skip loading any trigger modules.

Because the plugins execute the real entry point, they use the exact same configuration you already wrote for runtime. `functionDirectoryPath`, `searchGlob`, `funcNameFromRelPath` — all of it, by construction, without any duplication.

The mechanism:

1. Plugin sets `BFF_BUILD_DISCOVERY=1` and requires your entry point via `tsx` (which handles TypeScript transparently)
2. BFF detects the env var, runs glob + name derivation, but loads zero trigger modules
3. BFF stores the discovery result in a global registry keyed by the entry point path
4. Plugin reads the registry and gets a typed discovery map

The result is a `BffBuildDiscovery` object:

```typescript
{
  functionDirectoryPath: 'functions',
  entries: {
    'auth-onCreate': {
      absPath: '/project/src/functions/auth/on-create.func.ts',
      sourceRelativePath: 'auth/on-create.func.ts',
      runtimeRelativePath: 'auth/on-create.func.js',
      outputRelativePath: 'functions/auth/on-create.func.js',
      outputEntryName: 'functions/auth/on-create.func',
    },
    // ...
  }
}
```

Notice the distinction between `sourceRelativePath` (the `.ts` file that exists now) and `runtimeRelativePath` (the `.js` file that will exist after compilation). This is how the glob expansion works: if your runtime glob is `**/*.func.js`, BFF automatically expands it to `**/*.func.{js,ts}` during build discovery so it finds your TypeScript source files. The runtime path is still `.js`.

Each plugin then passes these absolute source paths to the bundler as independent entry points. Each bundler produces one output file per function, with tree shaking applied.

### The output layout matches the runtime layout

Before this design, the plugins reconstructed output paths from dash-separated function names. `auth-onCreate` became `auth/onCreate.js` by splitting on dashes. This worked for the default naming convention but broke silently if you used a custom `funcNameFromRelPath`.

Now the output layout mirrors the source layout directly, preserving `functionDirectoryPath`:

```
src/functions/auth/on-create.func.ts  →  dist/functions/auth/on-create.func.js
src/functions/http/get-user.func.ts   →  dist/functions/http/get-user.func.js
```

This means the runtime `main.js` can keep using the exact same `functionDirectoryPath` and `searchGlob` you configured in the entry point. The layout is consistent from source to build to deploy.

### Using the plugins

The entry point is where all config lives:

```typescript
// src/index.ts — runtime config (the only place you configure BFF)
import { exportFunctions } from 'better-firebase-functions';

exportFunctions({
  __filename,
  exports,
  functionDirectoryPath: './functions',
  searchGlob: '**/*.func.js',
});
```

The bundler config just needs the entry point path:

```typescript
// esbuild build script
import { buildFunctions } from 'better-firebase-functions-esbuild';

await buildFunctions({
  entryPoint: resolve(__dirname, 'src/index.ts'),
  outdir: 'dist',
  target: 'node20',
});
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

```typescript
// rollup.config.ts
import { bffRollupPlugin, bffRollupOutput } from 'better-firebase-functions-rollup';

export default {
  input: 'src/index.ts',
  output: bffRollupOutput({ dir: 'dist' }),
  plugins: [bffRollupPlugin({ entryPoint: resolve(__dirname, 'src/index.ts') })],
};
```

If you ever need a custom `funcNameFromRelPath` or a non-standard `searchGlob`, you only write it once, in the entry point. The bundler inherits it automatically.

---

## Part 5: Measuring it — real cold starts on real Firebase

Theory is fine. Numbers are better.

### The benchmark setup

We deployed two functions to a Firebase Gen 2 project (Cloud Run, `us-central1`, Node 20, 256MB RAM, max 1 instance, no minimum instances):

1. **BFF function** — uses `better-firebase-functions` + `exportFunctions()` as the entry point. On cold start, only one module is loaded.
2. **Static function** — identical implementation, but exported directly without BFF. Acts as the baseline.

Both functions perform the same work on each request:
- Initialize `firebase-admin` if not already initialized
- Firestore read (get a document)
- Firestore write (set a document with merge)
- Return timing data as JSON

Each function instruments every stage with `performance.now()` and includes the measurements in the HTTP response body — so we have handler-level timing, not just curl timing.

`[AUTHOR PROMPT]`
> **Why did you choose Firestore read/write as the benchmark workload? Was it realistic — does it represent what most Firebase functions actually do? What other workloads would be interesting to benchmark?**

### Running the benchmark

```bash
PROJECT_ID=bff-e2e-testing ./e2e/run-deploy-benchmark.sh
```

The script:
1. Builds the core library from source and packs it as a local tarball
2. Installs dependencies in both function codebases, refreshing the lockfile
3. Deploys both functions via Firebase CLI
4. Invokes cold (first hit) then warm (immediate second hit) for each function
5. Fetches Firebase function logs and filters for benchmark markers
6. Parses the JSON response bodies and prints a comparison table

This is also wired into a GitHub Actions workflow (`e2e-deploy-benchmark.yml`) that can be triggered manually — giving you reproducible benchmarks from CI with artifact upload.

### The results

| | curl total | handler total | admin init | Firestore read | Firestore write | invocations | cold? |
|---|---|---|---|---|---|---|---|
| **bff-cold** | 1724ms | **1313ms** | 2.8ms | 922ms | 386ms | 1 | yes |
| **bff-warm** | 471ms | **149ms** | 0.02ms | 72ms | 75ms | 2 | no |
| **static-cold** | 1862ms | **1461ms** | 5.5ms | 1329ms | 123ms | 1 | yes |
| **static-warm** | 487ms | **116ms** | 0.02ms | 47ms | 68ms | 2 | no |

A few things to observe:

**Firestore dominates cold-start time.** The first Firestore read takes 922ms (BFF) vs 1329ms (static) on cold start — this is the SDK establishing a gRPC connection to Firestore for the first time. Subsequent reads drop to 72ms and 47ms respectively. This is the expected behavior for any function that uses Firestore.

**BFF's module-loading cost is zero overhead.** In a single-function benchmark like this, BFF can't demonstrate a *reduction* in module-loading time (there's only one module). But the cold-start handler time is slightly faster for BFF (1313ms vs 1461ms), likely due to Firestore connection variability between runs. The key result is what's absent: there's no observable penalty from BFF's dynamic discovery mechanism.

**The warm path is where you live.** At 149ms vs 116ms, both functions handle warm requests quickly. The ~30ms difference is noise at this scale — Firestore connection is already warm, admin SDK is initialized, the module is cached.

`[AUTHOR PROMPT]`
> **What do you think the benchmark would look like in a project with 20 functions? 50? Have you seen real projects where BFF made a measurable difference in production? Can you share anything — even approximate numbers or project characteristics?**

`[AUTHOR PROMPT]`
> **The static baseline and BFF cold-start numbers are closer than you might expect. Is that surprising to you? How would you explain it to a reader who expected a bigger gap in a single-function test?**

### What the logs show

The benchmark function logs each stage to stdout using a consistent format:

```
[bench:bff] stage=module_loaded ts=1774157834727 pid=1
[bench:bff] runId=run-xyz stage=admin_init ms=2.840 adminCold=true
[bench:bff] runId=run-xyz stage=firestore_read ms=921.950
[bench:bff] runId=run-xyz stage=firestore_write ms=386.420
[bench:bff] runId=run-xyz stage=handler_total ms=1312.590 coldLikely=true uptimeMs=21414 invocations=1
```

The `[better-firebase-functions]` prefix shows the library's own timing:

```
[better-firebase-functions] Directory Glob Search: 7.1ms
[better-firebase-functions] Load Module (Cold-Start): 0.006ms
```

The glob search takes ~7ms. Loading the single matched module takes under 0.01ms. Total BFF overhead on cold start: **~7ms**. This overhead is constant regardless of project size — glob is fast, and only one module is ever loaded.

---

## Part 6: What's next

`[AUTHOR PROMPT]`
> **What's on your roadmap for better-firebase-functions after v7? Are there features users have asked for that you haven't built yet? Is there a v8 in mind?**

Some directions worth exploring:

**Bundler plugin benchmarks.** We benchmarked the core runtime optimization. The next logical step is benchmarking the bundler plugins against the runtime-only approach — measuring whether per-function bundling with tree shaking produces meaningfully faster cold starts in a large project.

**ESM-native support.** Firebase Functions now supports ESM entry points. `exportFunctionsAsync()` is the first step, and the build-discovery mechanism works for async entry points too. Full ESM benchmarking against Gen 2 is a natural follow-up.

**The build-once deploy-many pattern.** The bundler plugins enable an interesting architecture: you can run glob discovery and bundling as a CI step, cache the output, and deploy only changed functions using Firebase's codebase feature. This is a natural next post.

`[AUTHOR PROMPT]`
> **Is there anything about the Gen 2 / Cloud Run architecture that you think developers are getting wrong or underestimating? Any gotchas that burned you during this work that others should know about?**

---

## Conclusion

`[AUTHOR PROMPT]`
> **What do you want the reader to take away? Why does this work matter to you — is it the engineering challenge, the practical impact on production systems, something else?**

`better-firebase-functions` started as a small utility. v7 turns it into a coherent ecosystem: a zero-dependency core library, three bundler plugins, a hardened Gen 2 runtime adapter, and a benchmark workflow you can run against your own Firebase project.

The cold-start problem in serverless functions is fundamental — you're always trading off startup time against isolation. `better-firebase-functions` is one of the few optimizations you can apply without changing your architecture: drop it in, point it at your functions directory, and let it do the work.

The numbers are there. The code is there. Give it a try.

---

## Code and resources

- GitHub: [george43g/better-firebase-functions](https://github.com/george43g/better-firebase-functions)
- npm: [better-firebase-functions](https://www.npmjs.com/package/better-firebase-functions)
- Bundler plugins:
  - [better-firebase-functions-esbuild](https://www.npmjs.com/package/better-firebase-functions-esbuild)
  - [better-firebase-functions-webpack](https://www.npmjs.com/package/better-firebase-functions-webpack)
  - [better-firebase-functions-rollup](https://www.npmjs.com/package/better-firebase-functions-rollup)
- Benchmark script: [`e2e/run-deploy-benchmark.sh`](https://github.com/george43g/better-firebase-functions/blob/feat/v7-modernization/e2e/run-deploy-benchmark.sh)

---

*Suggested tags: Firebase, Cloud Functions, Node.js, Performance, Serverless*
