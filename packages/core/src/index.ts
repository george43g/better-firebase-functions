export {
  BFF_BUILD_DISCOVERY_ENV_VAR,
  BFF_DISCOVERY_EXPORT_KEY,
  consumeBuildDiscovery,
  discoverFunctionPaths,
  exportFunctions,
  exportFunctionsAsync,
  funcNameFromRelPathDefault,
  type BffBuildDiscovery,
  type BffDiscoveredFunction,
  type DiscoverFunctionPathsConfig,
  type ExportFunctionsConfig,
} from "./export-functions";

// Re-export utilities for use by bundler plugins
export { camelCase } from "./utils/camelcase";
export { setPath } from "./utils/set-path";
