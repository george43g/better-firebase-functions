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
