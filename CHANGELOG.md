# [7.1.0](https://github.com/george43g/better-firebase-functions/compare/v7.0.2...v7.1.0) (2026-04-01)


### Features

* **docs:** bundle skill directory with all npm packages for agent discovery ([3392015](https://github.com/george43g/better-firebase-functions/commit/33920155f71557649429d109caae285e23900bee))

## [7.0.2](https://github.com/george43g/better-firebase-functions/compare/v7.0.1...v7.0.2) (2026-03-30)


### Bug Fixes

* **release:** retry publish with refreshed npm credentials ([ad6149a](https://github.com/george43g/better-firebase-functions/commit/ad6149a4b341fd333b85a4c6e946bb72893b7029))

## [7.0.1](https://github.com/george43g/better-firebase-functions/compare/v7.0.0...v7.0.1) (2026-03-30)


### Bug Fixes

* **release:** trigger patch publish for companion packages ([d31c7e2](https://github.com/george43g/better-firebase-functions/commit/d31c7e2ad31731fc1e439f5e805cdbaf3713c5fc))

# [7.0.0](https://github.com/george43g/better-firebase-functions/compare/v6.0.1...v7.0.0) (2026-03-30)


* feat!: modernize to v7 monorepo with bundler plugins ([dd70f10](https://github.com/george43g/better-firebase-functions/commit/dd70f107eeb10223f7ea4e580463cc87ff4d3ed3))


### Bug Fixes

* **ci:** restore bundler smoke workflow after deps upgrade ([d89cf6e](https://github.com/george43g/better-firebase-functions/commit/d89cf6ee2e82240f9467fd751488ad258f1f1bc9))
* stabilize e2e bundler smoke deployments ([e3dba77](https://github.com/george43g/better-firebase-functions/commit/e3dba770f11fa69071310a79c4cf93a6cdabefda))
* strip ANSI codes when parsing bundler function URLs ([8727896](https://github.com/george43g/better-firebase-functions/commit/8727896860069515d5edc158401329d4ac2b92e6))


### Features

* add e2e deploy benchmark, bundler READMEs, core Gen2 matching fixes ([03718d9](https://github.com/george43g/better-firebase-functions/commit/03718d9c069a458b28b3d7d1de37b103d68c98ea))
* align bundler discovery with runtime BFF config ([b0bc5f6](https://github.com/george43g/better-firebase-functions/commit/b0bc5f69ca0207d659b2bd3eacac3482457d0bf9))
* bundler e2e smoke tests, AI agent skill, webpack/rollup bug fixes, docs overhaul ([54d1d3c](https://github.com/george43g/better-firebase-functions/commit/54d1d3c10803660a1296c616cc4d83b6e4d0a51d))


### BREAKING CHANGES

* Restructured as Turborepo monorepo with 4 packages.

Core library (better-firebase-functions):
- Upgraded TypeScript 4.9 -> 5.7, target ES2022
- Replaced @vercel/ncc with tsup (esbuild-based) for bundling
- Inlined camelcase and lodash.set as zero-dep utilities
- Replaced glob with fast-glob for faster file discovery
- Added exportFunctionsAsync() for ESM module loading via import()
- Fixed self-exclusion to handle .mjs extensions
- Improved Gen 2 (K_SERVICE) support with dedicated tests
- Replaced Jest with Vitest (29 tests passing)
- Node.js 18+ required (dropped 14/16)

New bundler plugins for per-function build optimization:
- better-firebase-functions-esbuild: buildFunctions() + discoverFunctionEntryPoints()
- better-firebase-functions-webpack: BffWebpackPlugin class
- better-firebase-functions-rollup: bffRollupPlugin() + bffRollupOutput()

Updated CI to test on Node 18/20/22 with Turborepo.

## [6.0.1](https://github.com/george43g/better-firebase-functions/compare/v6.0.0...v6.0.1) (2024-05-10)


### Bug Fixes

* **firebase-functions:** fixed several bugs that prevented functions v2 from working ([26d74e3](https://github.com/george43g/better-firebase-functions/commit/26d74e3bcca69e370d13f0a6611093f47240ba9d))

# [6.0.0](https://github.com/george43g/better-firebase-functions/compare/v5.0.0...v6.0.0) (2023-03-12)


### Build System

* **deps:** modernize library & upgrade all deps ([eeadb33](https://github.com/george43g/better-firebase-functions/commit/eeadb33f338909e28906c50c8be4031987008a0b)), closes [#55](https://github.com/george43g/better-firebase-functions/issues/55)


### BREAKING CHANGES

* **deps:** Newer versions of all files should bump version number. Also, testing will now run
on node 14, 16 & 18.

# [5.0.0](https://github.com/george43g/better-firebase-functions/compare/v4.0.0...v5.0.0) (2023-02-19)


### Features

* **exportfunctions:** update search glob to sensible default to find both js and ts files ([362ceab](https://github.com/george43g/better-firebase-functions/commit/362ceabb412abffc06d403bce33fb236bfab416e))


### BREAKING CHANGES

* **exportfunctions:** The new default search glob may break some setups in rare situations where js files
and ts files are in the same directory.

# [4.0.0](https://github.com/gramstr/better-firebase-functions/compare/v3.4.1...v4.0.0) (2022-03-09)


### Bug Fixes

* **exportfunctions:** deep directory case was broken ([4e29ad3](https://github.com/gramstr/better-firebase-functions/commit/4e29ad30d2afdc9649177d409d589c05fa621506))


### Build System

* **deps:** update all dependencies to latest versions & close dependabot generated auto updates ([4b8c287](https://github.com/gramstr/better-firebase-functions/commit/4b8c2875ecd43a3b8f91ced768a77abdf35bdd9a))


### Features

* **default.ts:** remove deprecated default export function ([f6fdbd2](https://github.com/gramstr/better-firebase-functions/commit/f6fdbd2689826c86aa3ba1939c6a642a4a583946))


### BREAKING CHANGES

* **deps:** Version upgrade of Node may be a breaking change
* **default.ts:** The breaking change with this update is that any codebases utilising the default
export will no longer work. Please update to use the exported named function exportFunctions.

## [3.4.1](https://github.com/gramstr/better-firebase-functions/compare/v3.4.0...v3.4.1) (2020-06-08)


### Bug Fixes

* **funcnamefromrelpath:** handle windows path separator correctly ([9ad72b8](https://github.com/gramstr/better-firebase-functions/commit/9ad72b8184aa211ac2f62e2bbe57e4f10770dedd)), closes [#4](https://github.com/gramstr/better-firebase-functions/issues/4)

# [3.4.0](https://github.com/gramstr/better-firebase-functions/compare/v3.3.2...v3.4.0) (2020-06-06)


### Features

* **extracttriggers:** function name param to allow multi-trigger files ([4e51dbb](https://github.com/gramstr/better-firebase-functions/commit/4e51dbb4a7c3482dc0a3826e3e7feba2628a3dcf)), closes [#6](https://github.com/gramstr/better-firebase-functions/issues/6)

## [3.3.2](https://github.com/gramstr/better-firebase-functions/compare/v3.3.1...v3.3.2) (2020-06-06)


### Bug Fixes

* **exportfunctions:** backwards compatible with FUNCTION_NAME env var ([ca95831](https://github.com/gramstr/better-firebase-functions/commit/ca9583191bacd75c29886dbc6eba685994278e47)), closes [#7](https://github.com/gramstr/better-firebase-functions/issues/7) [#7](https://github.com/gramstr/better-firebase-functions/issues/7)

## [3.3.1](https://github.com/gramstr/better-firebase-functions/compare/v3.3.0...v3.3.1) (2020-06-06)


### Bug Fixes

* **exportfunctions:** process.env.FUNCTION_NAME is now called K_SERVICE ([956e52c](https://github.com/gramstr/better-firebase-functions/commit/956e52cde508bc496bf266f331a0c679df6bcf08)), closes [#7](https://github.com/gramstr/better-firebase-functions/issues/7)

# [3.3.0](https://github.com/gramstr/better-firebase-functions/compare/v3.2.2...v3.3.0) (2020-05-05)


### Features

* **funcnamefromrelpathdefault:** export built in func name generator ([6428095](https://github.com/gramstr/better-firebase-functions/commit/6428095da7c9889918df3f2cbbd6109476aff595))

## [3.2.2](https://github.com/gramstr/better-firebase-functions/compare/v3.2.1...v3.2.2) (2020-05-05)


### Bug Fixes

* **default:** use eval() in require call for webpack compatibility ([a52dd37](https://github.com/gramstr/better-firebase-functions/commit/a52dd375e0581f8f942ee58e063534270f92dc15))
* **exportpathmode:** skip trying to load modules & just add paths ([2f4d994](https://github.com/gramstr/better-firebase-functions/commit/2f4d9942833d0b9c2fb680447f73585336ecb5cd))

## [3.2.1](https://github.com/gramstr/better-firebase-functions/compare/v3.2.0...v3.2.1) (2020-05-05)


### Bug Fixes

* **exportfunctions:** use eval() to preserve require call for webpack ([4d4906c](https://github.com/gramstr/better-firebase-functions/commit/4d4906c65e0308cfd49c2427cb8dd39ede0b5891))
