import fg from "fast-glob";
import { resolve, sep } from "path";
import { camelCase } from "./utils/camelcase";
import { setPath } from "./utils/set-path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDirnameFromFilename(filename: string): string {
  return filename.split(sep).slice(0, -1).join(sep);
}

function normalizeRelativePath(filePath: string): string {
  return filePath.split("/").join(sep);
}

function normalizeRelativeDirectory(filePath: string): string {
  return normalizeRelativePath(filePath)
    .split(sep)
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join(sep);
}

function joinRelativePath(...parts: string[]): string {
  return parts.filter(Boolean).join(sep);
}

function stripKnownModuleExtension(filePath: string): string {
  return filePath.replace(/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/u, "");
}

function isSameModuleFile(leftPath: string, rightPath: string): boolean {
  return (
    stripKnownModuleExtension(leftPath) === stripKnownModuleExtension(rightPath)
  );
}

function toRuntimeRelativePath(sourceRelativePath: string): string {
  return sourceRelativePath.replace(/\.(cts|mts|tsx|ts)$/u, (match) => {
    if (match === ".cts") return ".cjs";
    if (match === ".mts") return ".mjs";
    return ".js";
  });
}

function expandBraceExtensionGroup(group: string): string {
  const extensions = group
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const expanded = new Set(extensions);
  if (expanded.has("js")) expanded.add("ts");
  if (expanded.has("cjs")) expanded.add("cts");
  if (expanded.has("mjs")) expanded.add("mts");
  if (expanded.has("jsx")) expanded.add("tsx");
  return `{${Array.from(expanded).join(",")}}`;
}

function toBuildDiscoverySearchGlob(searchGlob: string): string {
  const withExpandedBraces = searchGlob.replace(
    /\{([^}]+)\}/gu,
    (_match, group) => {
      return expandBraceExtensionGroup(group);
    },
  );

  if (withExpandedBraces !== searchGlob) return withExpandedBraces;

  return withExpandedBraces
    .replace(/\.cjs\b/gu, ".{cjs,cts}")
    .replace(/\.mjs\b/gu, ".{mjs,mts}")
    .replace(/\.jsx\b/gu, ".{jsx,tsx}")
    .replace(/\.js\b/gu, ".{js,ts}");
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
  const fileChunk = camelCase(fileName.split(".")[0]);
  return dirChunks.length > 0
    ? `${dirChunks.join("-")}-${fileChunk}`
    : fileChunk;
}

// ---------------------------------------------------------------------------
// Environment detection (Gen 1 + Gen 2)
// ---------------------------------------------------------------------------

/** Returns the running function instance name, or undefined during deployment */
const getFunctionInstance = (): string | undefined =>
  process.env.FUNCTION_TARGET ||
  process.env.FUNCTION_NAME ||
  process.env.K_SERVICE ||
  undefined;

export const BFF_BUILD_DISCOVERY_ENV_VAR = "BFF_BUILD_DISCOVERY";
export const BFF_DISCOVERY_EXPORT_KEY = "__bff_discovery";

const isBuildDiscovery = (): boolean =>
  process.env[BFF_BUILD_DISCOVERY_ENV_VAR] === "1";

const canonicalizeFunctionName = (name: string | undefined): string =>
  (name ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

const getNameCandidates = (name: string | undefined): string[] => {
  if (!name) return [];
  const raw = name.trim();
  if (!raw) return [];
  const lastPathSegment = raw.split("/").filter(Boolean).at(-1);
  return Array.from(
    new Set([raw, ...(lastPathSegment ? [lastPathSegment] : [])]),
  );
};

/** True when Firebase CLI is deploying (no function instance env var set) */
const isDeployment = (): boolean => !getFunctionInstance();

/** True when the derived function name matches the currently running instance */
const funcNameMatchesInstance = (funcName: string): boolean => {
  const instance = getFunctionInstance();
  if (!instance) return false;
  const canonicalFuncName = canonicalizeFunctionName(funcName);
  return getNameCandidates(instance).some((candidate) => {
    return (
      funcName === candidate ||
      canonicalFuncName === canonicalizeFunctionName(candidate)
    );
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
  return eval("require")(absPath);
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
   * your runtime supports TypeScript natively. During bundler build-discovery,
   * BFF automatically expands `.js`/`.cjs`/`.mjs` globs to match source
   * `.ts`/`.cts`/`.mts` files as well.
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
   * Useful for debugging runtime discovery, but bundler plugins now prefer the
   * dedicated build-discovery mode triggered via `BFF_BUILD_DISCOVERY=1`.
   */
  exportPathMode?: boolean;
}

export interface DiscoverFunctionPathsConfig {
  __dirname?: string;
  __filename: string;
  functionDirectoryPath?: string;
  searchGlob?: string;
  funcNameFromRelPath?: (relativePath: string) => string;
  enableLogger?: boolean;
  logger?: {
    time(msg: string): void;
    timeEnd(msg: string): void;
    log(msg: string): void;
    [key: string]: any;
  };
}

export interface BffDiscoveredFunction {
  absPath: string;
  sourceRelativePath: string;
  runtimeRelativePath: string;
  outputRelativePath: string;
  outputEntryName: string;
}

export interface BffBuildDiscovery {
  functionDirectoryPath: string;
  entries: Record<string, BffDiscoveredFunction>;
}

type BffBuildDiscoveryRegistry = Record<string, BffBuildDiscovery>;

const BFF_DISCOVERY_REGISTRY_KEY = "__BFF_BUILD_DISCOVERY_REGISTRY__";

// ---------------------------------------------------------------------------
// Log message constants
// ---------------------------------------------------------------------------

const PREFIX = "[better-firebase-functions]";
const coldModuleMsg = `${PREFIX} Load Module (Cold-Start)`;
const dirSearchMsg = `${PREFIX} Directory Glob Search`;
const deployMsg = `${PREFIX} Load & Export Modules (Deployment)`;

// ---------------------------------------------------------------------------
// Shared discovery helpers
// ---------------------------------------------------------------------------

function discoverFilesForRuntime(
  cwd: string,
  searchGlob: string,
  log: typeof disabledLogger,
): string[] {
  log.time(dirSearchMsg);
  const files = fg.sync(searchGlob, { cwd, dot: false });
  log.timeEnd(dirSearchMsg);
  return files;
}

export function discoverFunctionPaths({
  __filename,
  __dirname,
  functionDirectoryPath = "./",
  searchGlob = "**/*.{js,ts}",
  funcNameFromRelPath = funcNameFromRelPathDefault,
  enableLogger = false,
  logger = console,
}: DiscoverFunctionPathsConfig): BffBuildDiscovery {
  const log = enableLogger ? logger : disabledLogger;
  const cwd = resolve(
    __dirname ?? getDirnameFromFilename(__filename),
    functionDirectoryPath,
  );
  const buildSearchGlob = toBuildDiscoverySearchGlob(searchGlob);
  const files = discoverFilesForRuntime(cwd, buildSearchGlob, log);
  const normalizedFunctionDirectoryPath = normalizeRelativeDirectory(
    functionDirectoryPath,
  );
  const entries: Record<string, BffDiscoveredFunction> = {};

  for (const file of files) {
    const sourceRelativePath = normalizeRelativePath(file);
    const absPath = resolve(cwd, sourceRelativePath);
    if (isSameModuleFile(absPath, __filename)) continue;

    const runtimeRelativePath = toRuntimeRelativePath(sourceRelativePath);
    const funcName = funcNameFromRelPath(runtimeRelativePath);
    const outputRelativePath = joinRelativePath(
      normalizedFunctionDirectoryPath,
      runtimeRelativePath,
    );

    entries[funcName] = {
      absPath,
      sourceRelativePath,
      runtimeRelativePath,
      outputRelativePath,
      outputEntryName: stripKnownModuleExtension(outputRelativePath),
    };
  }

  return {
    functionDirectoryPath: normalizedFunctionDirectoryPath,
    entries,
  };
}

function attachBuildDiscovery(
  exportsObj: any,
  discovery: BffBuildDiscovery,
): any {
  exportsObj[BFF_DISCOVERY_EXPORT_KEY] = discovery;
  return exportsObj;
}

function getBuildDiscoveryRegistry(): BffBuildDiscoveryRegistry {
  const globalScope = globalThis as typeof globalThis & {
    [BFF_DISCOVERY_REGISTRY_KEY]?: BffBuildDiscoveryRegistry;
  };

  if (!globalScope[BFF_DISCOVERY_REGISTRY_KEY]) {
    globalScope[BFF_DISCOVERY_REGISTRY_KEY] = {};
  }

  return globalScope[BFF_DISCOVERY_REGISTRY_KEY]!;
}

function registerBuildDiscovery(
  __filename: string,
  discovery: BffBuildDiscovery,
): BffBuildDiscovery {
  getBuildDiscoveryRegistry()[resolve(__filename)] = discovery;
  return discovery;
}

export function consumeBuildDiscovery(
  entryPoint: string,
): BffBuildDiscovery | undefined {
  const registry = getBuildDiscoveryRegistry();
  const key = resolve(entryPoint);
  const discovery = registry[key];
  delete registry[key];
  return discovery;
}

function getRuntimeSearchContext({
  __filename,
  __dirname,
  functionDirectoryPath,
  searchGlob,
  enableLogger,
  logger,
}: Pick<
  ExportFunctionsConfig,
  | "__filename"
  | "__dirname"
  | "functionDirectoryPath"
  | "searchGlob"
  | "enableLogger"
  | "logger"
>) {
  const log = enableLogger ? (logger ?? console) : disabledLogger;
  const cwd = resolve(
    __dirname ?? getDirnameFromFilename(__filename),
    functionDirectoryPath ?? "./",
  );
  const files = discoverFilesForRuntime(cwd, searchGlob ?? "**/*.{js,ts}", log);
  return { cwd, files, log };
}

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
 * During bundler build-discovery (`BFF_BUILD_DISCOVERY=1`), BFF does not load
 * any trigger modules. It instead exposes a structured discovery result on
 * `exports.__bff_discovery` so bundlers can reuse the exact same runtime config
 * (glob, directory, name generator) without duplicating it in build tooling.
 *
 * @returns The populated `exports` object (also mutated in-place).
 */
export function exportFunctions({
  __filename,
  exports,
  functionDirectoryPath = "./",
  searchGlob = "**/*.{js,ts}",
  funcNameFromRelPath = funcNameFromRelPathDefault,
  enableLogger = false,
  logger = console,
  extractTrigger = (mod: any) => mod?.default,
  __dirname,
  exportPathMode = false,
}: ExportFunctionsConfig): any {
  if (isBuildDiscovery()) {
    const discovery = registerBuildDiscovery(
      __filename,
      discoverFunctionPaths({
        __filename,
        __dirname,
        functionDirectoryPath,
        searchGlob,
        funcNameFromRelPath,
        enableLogger,
        logger,
      }),
    );

    return attachBuildDiscovery(exports, discovery);
  }

  const { cwd, files, log } = getRuntimeSearchContext({
    __filename,
    __dirname,
    functionDirectoryPath,
    searchGlob,
    enableLogger,
    logger,
  });

  const instanceName = getFunctionInstance();
  const moduleSearchMsg = `${PREFIX} Search for Module '${instanceName}'`;
  if (isDeployment()) log.time(deployMsg);
  else log.time(moduleSearchMsg);

  for (const file of files) {
    const absPath = resolve(cwd, file);
    const normalizedRelativePath = normalizeRelativePath(file);
    const funcName = funcNameFromRelPath(normalizedRelativePath);

    if (!isDeployment() && !funcNameMatchesInstance(funcName)) continue;
    if (!isDeployment()) log.timeEnd(moduleSearchMsg);
    if (isSameModuleFile(absPath, __filename)) continue;

    if (exportPathMode) {
      setPath(exports, funcName.split("-"), normalizedRelativePath);
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

    setPath(exports, funcName.split("-"), funcTrigger);
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
 */
export async function exportFunctionsAsync({
  __filename,
  exports,
  functionDirectoryPath = "./",
  searchGlob = "**/*.{js,ts,mjs}",
  funcNameFromRelPath = funcNameFromRelPathDefault,
  enableLogger = false,
  logger = console,
  extractTrigger = (mod: any) => {
    const def = mod?.default;
    return def?.default !== undefined ? def.default : def;
  },
  __dirname,
  exportPathMode = false,
}: ExportFunctionsConfig): Promise<any> {
  if (isBuildDiscovery()) {
    const discovery = registerBuildDiscovery(
      __filename,
      discoverFunctionPaths({
        __filename,
        __dirname,
        functionDirectoryPath,
        searchGlob,
        funcNameFromRelPath,
        enableLogger,
        logger,
      }),
    );

    return attachBuildDiscovery(exports, discovery);
  }

  const { cwd, files, log } = getRuntimeSearchContext({
    __filename,
    __dirname,
    functionDirectoryPath,
    searchGlob,
    enableLogger,
    logger,
  });

  const instanceName = getFunctionInstance();
  const moduleSearchMsg = `${PREFIX} Search for Module '${instanceName}'`;
  if (isDeployment()) log.time(deployMsg);
  else log.time(moduleSearchMsg);

  for (const file of files) {
    const absPath = resolve(cwd, file);
    const normalizedRelativePath = normalizeRelativePath(file);
    const funcName = funcNameFromRelPath(normalizedRelativePath);

    if (!isDeployment() && !funcNameMatchesInstance(funcName)) continue;
    if (!isDeployment()) log.timeEnd(moduleSearchMsg);
    if (isSameModuleFile(absPath, __filename)) continue;

    if (exportPathMode) {
      setPath(exports, funcName.split("-"), normalizedRelativePath);
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

    setPath(exports, funcName.split("-"), funcTrigger);
  }

  if (isDeployment()) log.timeEnd(deployMsg);
  return exports;
}
