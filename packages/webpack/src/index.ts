import { sep } from "path";
import type { Compiler, WebpackPluginInstance } from "webpack";
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

export interface BffWebpackPluginOptions extends DiscoveryOverrideOptions {
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
   * The output filename for the main entry point.
   * @default 'main.js'
   */
  outputFileName?: string;

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
  options: BffWebpackPluginOptions,
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
  options: BffWebpackPluginOptions,
): Promise<BffBuildDiscovery> {
  if (hasManualDiscoveryOverrides(options))
    return buildManualDiscovery(options);

  try {
    return await loadDiscoveryFromEntrypoint(options.entryPoint);
  } catch (error) {
    throw new Error(
      `[bff-webpack] Failed to load BFF discovery config from '${options.entryPoint}'. ` +
        `If your entry point cannot be executed directly during the build, ` +
        `pass functionDirectoryPath/searchGlob/funcNameFromRelPath manually. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Webpack plugin
// ---------------------------------------------------------------------------

/**
 * Webpack plugin that discovers Firebase Cloud Function files and configures
 * webpack to build each one as an independent entry point.
 *
 * By default this reuses the exact runtime `exportFunctions()` config from your
 * entry point, so you do not need to duplicate search globs or custom naming
 * logic in webpack config.
 */
export class BffWebpackPlugin implements WebpackPluginInstance {
  private options: BffWebpackPluginOptions;

  constructor(options: BffWebpackPluginOptions) {
    this.options = options;
  }

  apply(compiler: Compiler): void {
    const { outputFileName = "main.js", verbose = false } = this.options;
    const pluginOptions = this.options;

    // Wire up output filename routing up-front (synchronous — safe to do here).
    // main → outputFileName, triggers → their outputEntryName path.
    const output = compiler.options.output ?? {};
    (output as any).filename = (pathData: any) => {
      const chunkName: string = pathData.chunk?.name ?? "[name]";
      if (chunkName === "main") return outputFileName;
      return `${chunkName}.js`;
    };
    compiler.options.output = output;

    // Use webpack's EntryPlugin to add each trigger as an independent entry.
    // This must happen in apply() (before run) so webpack normalises all entries together.
    compiler.hooks.beforeRun.tapPromise("BffWebpackPlugin", async () => {
      const discovery = await getBuildDiscovery(pluginOptions);

      if (verbose) {
        console.log(
          `[bff-webpack] Found ${Object.keys(discovery.entries).length} function entry points`,
        );
        for (const [name, entry] of Object.entries(discovery.entries)) {
          console.log(
            `  ${name} -> ${entry.absPath} (out: ${entry.outputRelativePath})`,
          );
        }
      }

      // Dynamically import EntryPlugin to avoid a static webpack peer dep at module load time.
      // eslint-disable-next-line no-eval
      const { EntryPlugin } = eval("require")("webpack") as typeof import("webpack");

      for (const entry of Object.values(discovery.entries)) {
        const chunkName = toPosixPath(entry.outputEntryName);
        new EntryPlugin(compiler.context, entry.absPath, { name: chunkName }).apply(compiler);
      }
    });
  }
}
