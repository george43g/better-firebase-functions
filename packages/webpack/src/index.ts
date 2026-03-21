import { resolve, sep } from 'path';
import type { Compiler, PathData, WebpackPluginInstance } from 'webpack';
import { exportFunctions } from 'better-firebase-functions';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BffWebpackPluginOptions {
  /**
   * Absolute path to the entry point file (index.ts/main.ts).
   */
  entryPoint: string;

  /**
   * Relative path from the entry point directory to the functions directory.
   * @default './'
   */
  functionDirectoryPath?: string;

  /**
   * Glob pattern for matching function files.
   * @default '** /*.{js,ts}' (without space)
   */
  searchGlob?: string;

  /**
   * Custom function name generator.
   */
  funcNameFromRelPath?: (relativePath: string) => string;

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
// Webpack plugin
// ---------------------------------------------------------------------------

/**
 * Webpack plugin that discovers Firebase Cloud Function files and configures
 * webpack to build each one as an independent entry point.
 *
 * Ported and modernized from the original migdev webpack config.
 *
 * @example
 * // webpack.config.ts
 * import { BffWebpackPlugin } from 'better-firebase-functions-webpack';
 *
 * export default {
 *   target: 'node',
 *   mode: 'production',
 *   plugins: [
 *     new BffWebpackPlugin({
 *       entryPoint: resolve(__dirname, 'src/index.ts'),
 *       functionDirectoryPath: './functions',
 *     }),
 *   ],
 * };
 */
export class BffWebpackPlugin implements WebpackPluginInstance {
  private options: BffWebpackPluginOptions;

  constructor(options: BffWebpackPluginOptions) {
    this.options = options;
  }

  apply(compiler: Compiler): void {
    const {
      entryPoint,
      functionDirectoryPath = './',
      searchGlob,
      funcNameFromRelPath,
      outputFileName = 'main.js',
      verbose = false,
    } = this.options;

    const entryDir = entryPoint.split(sep).slice(0, -1).join(sep);
    const rootDir = resolve(entryDir, functionDirectoryPath);

    // Discover function files using exportPathMode
    const exportsObj = exportFunctions({
      __filename: entryPoint,
      exports: {},
      functionDirectoryPath,
      searchGlob,
      funcNameFromRelPath,
      exportPathMode: true,
      enableLogger: verbose,
    });

    // Flatten to { funcName: absolutePath }
    const functionEntries: Record<string, string> = {};

    function flatten(obj: Record<string, any>, prefix: string[] = []) {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
          const relPath = obj[key] as string;
          const funcName = prefix.length > 0 ? [...prefix, key].join('-') : key;
          functionEntries[funcName] = resolve(rootDir, relPath);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          flatten(obj[key] as Record<string, any>, [...prefix, key]);
        }
      }
    }

    flatten(exportsObj);

    if (verbose) {
      console.log(`[bff-webpack] Found ${Object.keys(functionEntries).length} function entry points`);
    }

    // Hook into webpack compilation to add entry points and configure output
    compiler.hooks.environment.tap('BffWebpackPlugin', () => {
      const config = compiler.options;

      // Add function entry points to the existing entry configuration
      if (!config.entry || typeof config.entry === 'string' || Array.isArray(config.entry)) {
        // Convert simple entry to object form
        const existingEntry = config.entry;
        config.entry = {
          main: typeof existingEntry === 'string' ? existingEntry : (existingEntry as any),
          ...functionEntries,
        };
      } else if (typeof config.entry === 'object') {
        Object.assign(config.entry as Record<string, any>, functionEntries);
      }

      // Configure output filenames: main goes to outputFileName,
      // function entries use their dash-name converted to path separators
      const output = config.output ?? {};
      (output as any).filename = (pathData: PathData) => {
        const chunkName = pathData.chunk?.name;
        if (chunkName === 'main') return outputFileName;
        if (chunkName) {
          return `${chunkName.split('-').join(sep)}.js`;
        }
        return '[name].js';
      };
      config.output = output;
    });
  }
}
