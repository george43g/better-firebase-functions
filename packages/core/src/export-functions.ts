import fg from 'fast-glob';
import { resolve, sep } from 'path';
import { camelCase } from './utils/camelcase';
import { setPath } from './utils/set-path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDirnameFromFilename(filename: string): string {
  return filename.split(sep).slice(0, -1).join(sep);
}

/**
 * Default function name generator. Converts a relative file path into a
 * Firebase Cloud Functions-compatible name with dash-separated groups.
 *
 * Directory segments become function groups (separated by dashes).
 * Each segment is camelCased independently.
 *
 * @example
 * funcNameFromRelPathDefault('auth/on-create.func.ts')
 * // => 'auth-onCreate'
 *
 * @example
 * funcNameFromRelPathDefault('http/api/get-users.func.ts')
 * // => 'http-api-getUsers'
 */
export function funcNameFromRelPathDefault(relPath: string): string {
  const parts = relPath.split(sep);
  const fileName = parts.pop()!;
  const dirChunks = parts.map((segment) => camelCase(segment));
  const fileChunk = camelCase(fileName.split('.')[0]);
  // Join with '-' to create Firebase function group separators
  return dirChunks.length > 0 ? `${dirChunks.join('-')}-${fileChunk}` : fileChunk;
}

// ---------------------------------------------------------------------------
// Environment detection (Gen 1 + Gen 2)
// ---------------------------------------------------------------------------

/** Returns the running function instance name, or undefined during deployment */
const getFunctionInstance = (): string | undefined =>
  process.env.FUNCTION_TARGET || process.env.FUNCTION_NAME || process.env.K_SERVICE || undefined;

const canonicalizeFunctionName = (name: string | undefined): string =>
  (name ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const getNameCandidates = (name: string | undefined): string[] => {
  if (!name) return [];
  const raw = name.trim();
  if (!raw) return [];
  const lastPathSegment = raw.split('/').filter(Boolean).at(-1);
  return Array.from(new Set([raw, ...(lastPathSegment ? [lastPathSegment] : [])]));
};

/** True when Firebase CLI is deploying (no function instance env var set) */
const isDeployment = (): boolean => !getFunctionInstance();

/** True when the derived function name matches the currently running instance */
const funcNameMatchesInstance = (funcName: string): boolean => {
  const instance = getFunctionInstance();
  if (!instance) return false;
  const canonicalFuncName = canonicalizeFunctionName(funcName);
  return getNameCandidates(instance).some((candidate) => {
    return funcName === candidate || canonicalFuncName === canonicalizeFunctionName(candidate);
  });
};

// ---------------------------------------------------------------------------
// Module loading
// ---------------------------------------------------------------------------

/**
 * Load a module dynamically at runtime using require().
 *
 * Uses eval('require') to prevent bundlers (webpack, esbuild, rollup) from
 * statically analyzing and inlining the require call. The target paths are
 * only known at runtime (discovered via glob). This is the mechanism that
 * enables the cold-start optimization: only the single module matching the
 * running function instance is loaded.
 */
function loadModuleSync(absPath: string): any {
  // eslint-disable-next-line no-eval
  return eval('require')(absPath);
}

/**
 * Load a module using dynamic import(). Required for ESM-only modules.
 * Returns a Promise.
 */
async function loadModuleAsync(absPath: string): Promise<any> {
  return import(absPath);
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const disabledLogger = {
  time(_msg: string) {},
  timeEnd(_msg: string) {},
  log(_msg: string) {},
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration object for `exportFunctions()`.
 *
 * Required properties: `__filename` and `exports`.
 * All other properties have sensible defaults.
 */
export interface ExportFunctionsConfig {
  /**
   * Absolute path to the directory containing your entry point file.
   * Defaults to the directory of `__filename`. Override if your function
   * files live in a different root directory.
   */
  __dirname?: string;

  /**
   * Absolute path to the file calling `exportFunctions()`.
   * Pass Node's `__filename`. Used to prevent the entry point from
   * exporting itself.
   */
  __filename: string;

  /**
   * The `exports` (or `module.exports`) object from your entry point.
   * This is the object Firebase inspects to discover function triggers.
   */
  exports: any;

  /**
   * Relative path from `__dirname` to the directory containing function files.
   * @default './'
   */
  functionDirectoryPath?: string;

  /**
   * Glob pattern for matching function files.
   * NOTE: Match files as they appear AFTER compilation (`.js`) unless
   * your runtime supports TypeScript natively.
   * @default '** /*.{js,ts}' (without space)
   */
  searchGlob?: string;

  /**
   * Custom function to convert a relative file path into a function name.
   * Dashes `-` in the output create function groups in Firebase.
   */
  funcNameFromRelPath?: (relativePath: string) => string;

  /**
   * Custom function to extract the trigger from a loaded module.
   * @default (mod) => mod?.default
   */
  extractTrigger?: (inputModule: any, currentFunctionName?: string) => any;

  /** Enable performance timing logs. */
  enableLogger?: boolean;

  /** Custom logger (must have `time`, `timeEnd`, and `log` methods). */
  logger?: {
    time(msg: string): void;
    timeEnd(msg: string): void;
    log(msg: string): void;
    [key: string]: any;
  };

  /**
   * When true, exports relative file paths instead of actual triggers.
   * Used by build plugins (esbuild/webpack/rollup) to discover function
   * entry points at build time without loading any modules.
   */
  exportPathMode?: boolean;
}

// ---------------------------------------------------------------------------
// Log message constants
// ---------------------------------------------------------------------------

const PREFIX = '[better-firebase-functions]';
const coldModuleMsg = `${PREFIX} Load Module (Cold-Start)`;
const dirSearchMsg = `${PREFIX} Directory Glob Search`;
const deployMsg = `${PREFIX} Load & Export Modules (Deployment)`;

// ---------------------------------------------------------------------------
// Core: exportFunctions (synchronous, CJS)
// ---------------------------------------------------------------------------

/**
 * Automatically discovers, names, and exports Firebase Cloud Function triggers
 * from a directory of files.
 *
 * **Cold-start optimization**: During function invocation (when `FUNCTION_NAME`
 * or `K_SERVICE` env var is set), only the single matching module is loaded.
 * During deployment, all modules are loaded so Firebase can discover every
 * function trigger.
 *
 * Supports both Gen 1 (`FUNCTION_NAME`) and Gen 2 (`K_SERVICE`) functions.
 *
 * @returns The populated `exports` object (also mutated in-place).
 *
 * @example
 * // Basic usage in your index.ts entry point:
 * import { exportFunctions } from 'better-firebase-functions';
 * exportFunctions({ __filename, exports });
 *
 * @example
 * // Custom directory and glob:
 * exportFunctions({
 *   __filename,
 *   exports,
 *   functionDirectoryPath: './triggers',
 *   searchGlob: '** /*.func.js'
 * });
 */
export function exportFunctions({
  __filename,
  exports,
  functionDirectoryPath = './',
  searchGlob = '**/*.{js,ts}',
  funcNameFromRelPath = funcNameFromRelPathDefault,
  enableLogger = false,
  logger = console,
  extractTrigger = (mod: any) => mod?.default,
  __dirname,
  exportPathMode = false,
}: ExportFunctionsConfig): any {
  const log = enableLogger ? logger : disabledLogger;
  const cwd = resolve(__dirname ?? getDirnameFromFilename(__filename), functionDirectoryPath);

  // --- Glob search ---
  log.time(dirSearchMsg);
  const files = fg.sync(searchGlob, { cwd, dot: false });
  log.timeEnd(dirSearchMsg);

  const instanceName = getFunctionInstance();
  const moduleSearchMsg = `${PREFIX} Search for Module '${instanceName}'`;
  if (isDeployment()) log.time(deployMsg);
  else log.time(moduleSearchMsg);

  for (const file of files) {
    const absPath = resolve(cwd, file);
    // fast-glob always uses forward slashes — normalize to OS sep
    const normalizedRelativePath = file.split('/').join(sep);
    const funcName = funcNameFromRelPath(normalizedRelativePath);

    // Cold-start optimization: skip modules that don't match the running instance
    if (!isDeployment() && !funcNameMatchesInstance(funcName)) continue;
    if (!isDeployment()) log.timeEnd(moduleSearchMsg);

    // Prevent exporting self (compare without last 3 chars for .js/.ts/.mjs flexibility)
    if (absPath.slice(0, -3) === __filename.slice(0, -3)) continue;

    // Export path mode: export file paths instead of triggers (for build tools)
    if (exportPathMode) {
      setPath(exports, funcName.split('-'), normalizedRelativePath);
      continue;
    }

    if (!isDeployment()) log.time(coldModuleMsg);

    let funcTrigger: any;
    try {
      const mod = loadModuleSync(absPath);
      funcTrigger = extractTrigger(mod, instanceName);
    } catch (err) {
      console.warn(`${PREFIX} Failed to load module: ${absPath}`, err);
      continue;
    }

    if (!isDeployment()) log.timeEnd(coldModuleMsg);
    if (!funcTrigger) continue;

    setPath(exports, funcName.split('-'), funcTrigger);
  }

  if (isDeployment()) log.timeEnd(deployMsg);
  return exports;
}

// ---------------------------------------------------------------------------
// Core: exportFunctionsAsync (ESM-compatible, async)
// ---------------------------------------------------------------------------

/**
 * Async version of `exportFunctions()` that uses dynamic `import()` for
 * loading function modules. Required for ESM-only function files.
 *
 * When using `import()` on CJS modules, Node.js wraps the module in a
 * namespace object. The default `extractTrigger` handles this automatically
 * by unwrapping the namespace.
 *
 * Use with top-level await in ESM entry points, or inside an async IIFE
 * in CJS entry points.
 *
 * @example
 * // ESM entry point with top-level await:
 * import { exportFunctionsAsync } from 'better-firebase-functions';
 * const fns = await exportFunctionsAsync({
 *   __filename: import.meta.filename,
 *   exports: {},
 * });
 * export default fns;
 */
export async function exportFunctionsAsync({
  __filename,
  exports,
  functionDirectoryPath = './',
  searchGlob = '**/*.{js,ts,mjs}',
  funcNameFromRelPath = funcNameFromRelPathDefault,
  enableLogger = false,
  logger = console,
  extractTrigger = (mod: any) => {
    // import() on CJS modules wraps exports in a namespace: { default: { default: trigger } }
    // import() on ESM modules gives: { default: trigger }
    const def = mod?.default;
    return def?.default !== undefined ? def.default : def;
  },
  __dirname,
  exportPathMode = false,
}: ExportFunctionsConfig): Promise<any> {
  const log = enableLogger ? logger : disabledLogger;
  const cwd = resolve(__dirname ?? getDirnameFromFilename(__filename), functionDirectoryPath);

  log.time(dirSearchMsg);
  const files = fg.sync(searchGlob, { cwd, dot: false });
  log.timeEnd(dirSearchMsg);

  const instanceName = getFunctionInstance();
  const moduleSearchMsg = `${PREFIX} Search for Module '${instanceName}'`;
  if (isDeployment()) log.time(deployMsg);
  else log.time(moduleSearchMsg);

  for (const file of files) {
    const absPath = resolve(cwd, file);
    const normalizedRelativePath = file.split('/').join(sep);
    const funcName = funcNameFromRelPath(normalizedRelativePath);

    if (!isDeployment() && !funcNameMatchesInstance(funcName)) continue;
    if (!isDeployment()) log.timeEnd(moduleSearchMsg);
    if (absPath.slice(0, -3) === __filename.slice(0, -3)) continue;

    if (exportPathMode) {
      setPath(exports, funcName.split('-'), normalizedRelativePath);
      continue;
    }

    if (!isDeployment()) log.time(coldModuleMsg);

    let funcTrigger: any;
    try {
      const mod = await loadModuleAsync(absPath);
      funcTrigger = extractTrigger(mod, instanceName);
    } catch (err) {
      console.warn(`${PREFIX} Failed to load module: ${absPath}`, err);
      continue;
    }

    if (!isDeployment()) log.timeEnd(coldModuleMsg);
    if (!funcTrigger) continue;

    setPath(exports, funcName.split('-'), funcTrigger);
  }

  if (isDeployment()) log.timeEnd(deployMsg);
  return exports;
}
