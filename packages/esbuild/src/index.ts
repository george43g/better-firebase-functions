import { resolve, sep } from "path";
import type { BuildOptions, Plugin } from "esbuild";
import {
  BFF_BUILD_DISCOVERY_ENV_VAR,
  BFF_DISCOVERY_EXPORT_KEY,
  consumeBuildDiscovery,
  discoverFunctionPaths,
  type BffBuildDiscovery,
  type DiscoverFunctionPathsConfig,
} from "better-firebase-functions";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

type DiscoveryOverrideOptions = Partial<
  Pick<
    DiscoverFunctionPathsConfig,
    "__dirname" | "functionDirectoryPath" | "searchGlob" | "funcNameFromRelPath"
  >
>;

export interface BffEsbuildPluginOptions extends DiscoveryOverrideOptions {
  /**
   * Absolute path to the entry point file (index.ts/main.ts).
   * The plugin executes this file in BFF build-discovery mode so it can reuse
   * the exact `exportFunctions()` config already present in your entry point.
   */
  entryPoint: string;

  /**
   * Fallback discovery root override for projects where the entry point cannot
   * be executed directly at build time.
   */
  __dirname?: string;

  /**
   * Dependencies to externalize (not bundle). By default, reads from package.json.
   * Set to `true` to auto-read from package.json, or provide an explicit list.
   * @default true
   */
  external?: boolean | string[];

  /**
   * Node.js target version.
   * @default 'node20'
   */
  target?: string;

  /**
   * Enable verbose logging during the build.
   * @default false
   */
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Shared discovery logic
// ---------------------------------------------------------------------------

function toPosixPath(filePath: string): string {
  return filePath.split(sep).join("/");
}

function hasManualDiscoveryOverrides(
  options: DiscoveryOverrideOptions,
): boolean {
  return Boolean(
    options.__dirname ||
    options.functionDirectoryPath ||
    options.searchGlob ||
    options.funcNameFromRelPath,
  );
}

function buildManualDiscovery(
  options: BffEsbuildPluginOptions,
): BffBuildDiscovery {
  return discoverFunctionPaths({
    __filename: options.entryPoint,
    __dirname: options.__dirname,
    functionDirectoryPath: options.functionDirectoryPath,
    searchGlob: options.searchGlob,
    funcNameFromRelPath: options.funcNameFromRelPath,
    enableLogger: options.verbose,
  });
}

async function loadDiscoveryFromEntrypoint(
  entryPoint: string,
): Promise<BffBuildDiscovery> {
  const previousValue = process.env[BFF_BUILD_DISCOVERY_ENV_VAR];
  process.env[BFF_BUILD_DISCOVERY_ENV_VAR] = "1";

  try {
    try {
      const tsx = eval("require")("tsx/cjs/api") as {
        require: (request: string, parent: string) => any;
      };
      const loaded = tsx.require(entryPoint, __filename);
      const discovery =
        consumeBuildDiscovery(entryPoint) ??
        loaded?.[BFF_DISCOVERY_EXPORT_KEY] ??
        loaded?.default?.[BFF_DISCOVERY_EXPORT_KEY] ??
        loaded?.["module.exports"]?.[BFF_DISCOVERY_EXPORT_KEY];

      if (
        discovery &&
        typeof discovery === "object" &&
        "entries" in discovery
      ) {
        return discovery as BffBuildDiscovery;
      }
    } catch {
      // Fall through to ESM import mode below.
    }

    const { tsImport } = await import("tsx/esm/api");
    const loaded = await tsImport(entryPoint, __filename);
    const discovery =
      consumeBuildDiscovery(entryPoint) ??
      loaded?.[BFF_DISCOVERY_EXPORT_KEY] ??
      loaded?.default?.[BFF_DISCOVERY_EXPORT_KEY] ??
      loaded?.["module.exports"]?.[BFF_DISCOVERY_EXPORT_KEY];

    if (
      !discovery ||
      typeof discovery !== "object" ||
      !("entries" in discovery)
    ) {
      throw new Error(
        `Entrypoint '${entryPoint}' did not expose ${BFF_DISCOVERY_EXPORT_KEY}. ` +
          `Ensure it calls exportFunctions() or exportFunctionsAsync().`,
      );
    }

    return discovery as BffBuildDiscovery;
  } finally {
    if (previousValue === undefined)
      delete process.env[BFF_BUILD_DISCOVERY_ENV_VAR];
    else process.env[BFF_BUILD_DISCOVERY_ENV_VAR] = previousValue;
  }
}

async function getBuildDiscovery(
  options: BffEsbuildPluginOptions,
): Promise<BffBuildDiscovery> {
  if (hasManualDiscoveryOverrides(options))
    return buildManualDiscovery(options);

  try {
    return await loadDiscoveryFromEntrypoint(options.entryPoint);
  } catch (error) {
    throw new Error(
      `[bff-esbuild] Failed to load BFF discovery config from '${options.entryPoint}'. ` +
        `If your entry point cannot be executed directly during the build, ` +
        `pass functionDirectoryPath/searchGlob/funcNameFromRelPath manually. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Discover all function entry points.
 *
 * By default this executes your BFF entry point in build-discovery mode and
 * reuses the exact runtime config already passed to `exportFunctions()`.
 *
 * Returns a flat map of { functionName: absoluteFilePath }.
 */
export async function discoverFunctionEntryPoints(
  options: Pick<
    BffEsbuildPluginOptions,
    | "entryPoint"
    | "__dirname"
    | "functionDirectoryPath"
    | "searchGlob"
    | "funcNameFromRelPath"
    | "verbose"
  >,
): Promise<Record<string, string>> {
  const discovery = await getBuildDiscovery(options);
  return Object.fromEntries(
    Object.entries(discovery.entries).map(([funcName, entry]) => [
      funcName,
      entry.absPath,
    ]),
  );
}

/**
 * Discover build-ready esbuild entry points whose output paths already mirror
 * the runtime BFF layout.
 */
export async function discoverBuildEntryPoints(
  options: Pick<
    BffEsbuildPluginOptions,
    | "entryPoint"
    | "__dirname"
    | "functionDirectoryPath"
    | "searchGlob"
    | "funcNameFromRelPath"
    | "verbose"
  >,
): Promise<{
  entryPoints: Record<string, string>;
  discovery: BffBuildDiscovery;
}> {
  const discovery = await getBuildDiscovery(options);
  return {
    entryPoints: Object.fromEntries(
      Object.values(discovery.entries).map((entry) => [
        toPosixPath(entry.outputEntryName),
        entry.absPath,
      ]),
    ),
    discovery,
  };
}

// ---------------------------------------------------------------------------
// esbuild plugin
// ---------------------------------------------------------------------------

/**
 * esbuild plugin that logs discovered Firebase Cloud Function entry points.
 *
 * NOTE: esbuild's plugin API does not support dynamically adding entry points.
 * For per-function bundling, use `buildFunctions()` instead — it calls esbuild
 * directly with the correct multi-entry configuration.
 */
export function bffEsbuildPlugin(options: BffEsbuildPluginOptions): Plugin {
  return {
    name: "better-firebase-functions",
    setup(build) {
      const { verbose = false } = options;

      build.onStart(async () => {
        if (!verbose) return;
        const discovery = await getBuildDiscovery(options);
        const count = Object.keys(discovery.entries).length;
        console.log(`[bff-esbuild] Discovered ${count} function entry points`);
        for (const [name, entry] of Object.entries(discovery.entries)) {
          console.log(
            `  ${name} -> ${entry.absPath} (out: ${entry.outputRelativePath})`,
          );
        }
      });

      build.onEnd(() => {
        if (verbose) {
          console.log("[bff-esbuild] Build complete.");
        }
      });
    },
  };
}

/**
 * Build all Firebase Cloud Functions as independently bundled entry points.
 *
 * This is the recommended way to use this package — call it directly
 * instead of using the plugin with esbuild's `build()` API.
 */
export async function buildFunctions(
  options: BffEsbuildPluginOptions & {
    /** Output directory for built functions. */
    outdir: string;
    /** Additional esbuild options to merge. */
    esbuildOptions?: Partial<BuildOptions>;
  },
): Promise<{
  entryPoints: Record<string, string>;
  buildEntryPoints: Record<string, string>;
  discovery: BffBuildDiscovery;
  results: any[];
}> {
  const esbuild = await import("esbuild");

  const {
    entryPoint,
    external,
    target = "node20",
    verbose = false,
    outdir,
    esbuildOptions = {},
  } = options;

  const runtimeEntryPoints = await discoverFunctionEntryPoints(options);
  const { entryPoints: discoveredBuildEntryPoints, discovery } =
    await discoverBuildEntryPoints(options);
  const buildEntryPoints: Record<string, string> = {
    main: entryPoint,
    ...discoveredBuildEntryPoints,
  };

  if (verbose) {
    console.log(
      `[bff-esbuild] Found ${Object.keys(discovery.entries).length} function entry points:`,
    );
    for (const [name, entry] of Object.entries(discovery.entries)) {
      console.log(
        `  ${name} -> ${entry.absPath} (out: ${entry.outputRelativePath})`,
      );
    }
  }

  let externals: string[] = [];
  if (external === true || external === undefined) {
    try {
      const entryDir = entryPoint.split(sep).slice(0, -1).join(sep);
      // eslint-disable-next-line no-eval
      const pkg = eval("require")(resolve(entryDir, "package.json"));
      externals = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
      ];
    } catch {
      // No package.json found; bundle everything.
    }
  } else if (Array.isArray(external)) {
    externals = external;
  }

  const result = await esbuild.build({
    entryPoints: buildEntryPoints,
    outdir,
    bundle: true,
    platform: "node",
    format: "cjs",
    target,
    treeShaking: true,
    external: externals,
    sourcemap: true,
    minify: false,
    ...esbuildOptions,
  });

  return {
    entryPoints: runtimeEntryPoints,
    buildEntryPoints,
    discovery,
    results: [result],
  };
}
