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
