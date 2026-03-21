export {
  exportFunctions,
  exportFunctionsAsync,
  funcNameFromRelPathDefault,
  type ExportFunctionsConfig,
} from './export-functions';

// Re-export utilities for use by bundler plugins
export { camelCase } from './utils/camelcase';
export { setPath } from './utils/set-path';
