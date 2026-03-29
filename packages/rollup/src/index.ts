import { sep } from "path";
import type { Plugin, OutputOptions } from "rollup";
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

export interface BffRollupPluginOptions extends DiscoveryOverrideOptions {
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
   * Enable verbose logging.
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
  options: BffRollupPluginOptions,
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
  options: BffRollupPluginOptions,
): Promise<BffBuildDiscovery> {
  if (hasManualDiscoveryOverrides(options))
    return buildManualDiscovery(options);

  try {
    return await loadDiscoveryFromEntrypoint(options.entryPoint);
  } catch (error) {
    throw new Error(
      `[bff-rollup] Failed to load BFF discovery config from '${options.entryPoint}'. ` +
        `If your entry point cannot be executed directly during the build, ` +
        `pass functionDirectoryPath/searchGlob/funcNameFromRelPath manually. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Rollup plugin
// ---------------------------------------------------------------------------

/**
 * Rollup plugin that discovers Firebase Cloud Function files and injects
 * them as additional entry points for per-function bundling.
 *
 * By default this reuses the exact runtime `exportFunctions()` config from your
 * entry point, so you do not need to duplicate search globs or custom naming
 * logic in rollup config.
 */
export function bffRollupPlugin(options: BffRollupPluginOptions): Plugin {
  return {
    name: "better-firebase-functions",

    async buildStart() {
      const discovery = await getBuildDiscovery(options);

      if (options.verbose) {
        console.log(
          `[bff-rollup] Found ${Object.keys(discovery.entries).length} function entry points`,
        );
        for (const [name, entry] of Object.entries(discovery.entries)) {
          console.log(
            `  ${name} -> ${entry.absPath} (out: ${entry.outputRelativePath})`,
          );
        }
      }

      for (const entry of Object.values(discovery.entries)) {
        this.emitFile({
          type: "chunk",
          id: entry.absPath,
          name: toPosixPath(entry.outputEntryName),
        });
      }
    },
  };
}

/**
 * Helper to generate the recommended Rollup output config for Firebase Functions.
 *
 * Output paths now mirror your runtime BFF layout: the configured
 * `functionDirectoryPath` is preserved and each bundled trigger keeps the same
 * relative path it will have at runtime, with the extension converted to its
 * compiled JavaScript form.
 */
export function bffRollupOutput(options: {
  dir: string;
  mainFileName?: string;
  format?: "cjs" | "esm";
}): OutputOptions {
  const { dir, mainFileName = "main.js", format = "cjs" } = options;

  return {
    dir,
    format,
    sourcemap: true,
    entryFileNames: (chunkInfo) => {
      if (chunkInfo.name === "main" || chunkInfo.name === "index") {
        return mainFileName;
      }
      return `${chunkInfo.name}.js`;
    },
  };
}
