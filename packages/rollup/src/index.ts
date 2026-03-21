import { resolve, sep } from 'path';
import type { Plugin, OutputOptions } from 'rollup';
import { exportFunctions } from 'better-firebase-functions';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BffRollupPluginOptions {
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
   */
  searchGlob?: string;

  /**
   * Custom function name generator.
   */
  funcNameFromRelPath?: (relativePath: string) => string;

  /**
   * Enable verbose logging.
   * @default false
   */
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Discovery helper (same logic as esbuild/webpack plugins)
// ---------------------------------------------------------------------------

function discoverEntryPoints(options: BffRollupPluginOptions): Record<string, string> {
  const {
    entryPoint,
    functionDirectoryPath = './',
    searchGlob,
    funcNameFromRelPath,
    verbose = false,
  } = options;

  const entryDir = entryPoint.split(sep).slice(0, -1).join(sep);
  const rootDir = resolve(entryDir, functionDirectoryPath);

  const exportsObj = exportFunctions({
    __filename: entryPoint,
    exports: {},
    functionDirectoryPath,
    searchGlob,
    funcNameFromRelPath,
    exportPathMode: true,
    enableLogger: verbose,
  });

  const entries: Record<string, string> = {};

  function flatten(obj: Record<string, any>, prefix: string[] = []) {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        const relPath = obj[key] as string;
        const funcName = prefix.length > 0 ? [...prefix, key].join('-') : key;
        entries[funcName] = resolve(rootDir, relPath);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        flatten(obj[key] as Record<string, any>, [...prefix, key]);
      }
    }
  }

  flatten(exportsObj);
  return entries;
}

// ---------------------------------------------------------------------------
// Rollup plugin
// ---------------------------------------------------------------------------

/**
 * Rollup plugin that discovers Firebase Cloud Function files and injects
 * them as additional entry points for per-function bundling.
 *
 * @example
 * // rollup.config.ts
 * import { bffRollupPlugin } from 'better-firebase-functions-rollup';
 * import { resolve } from 'path';
 *
 * export default {
 *   input: 'src/index.ts',
 *   output: {
 *     dir: 'dist',
 *     format: 'cjs',
 *     entryFileNames: (chunkInfo) => {
 *       if (chunkInfo.name === 'main') return 'main.js';
 *       return chunkInfo.name.split('-').join('/') + '.js';
 *     },
 *   },
 *   plugins: [
 *     bffRollupPlugin({
 *       entryPoint: resolve(__dirname, 'src/index.ts'),
 *       functionDirectoryPath: './functions',
 *     }),
 *   ],
 * };
 */
export function bffRollupPlugin(options: BffRollupPluginOptions): Plugin {
  let functionEntries: Record<string, string> = {};

  return {
    name: 'better-firebase-functions',

    buildStart() {
      functionEntries = discoverEntryPoints(options);

      if (options.verbose) {
        console.log(`[bff-rollup] Found ${Object.keys(functionEntries).length} function entry points`);
      }

      // Inject discovered entry points into the input configuration
      for (const [name, path] of Object.entries(functionEntries)) {
        this.emitFile({
          type: 'chunk',
          id: path,
          name,
        });
      }
    },
  };
}

/**
 * Helper to generate the recommended Rollup output config for Firebase Functions.
 *
 * @example
 * import { bffRollupOutput } from 'better-firebase-functions-rollup';
 *
 * export default {
 *   output: bffRollupOutput({ dir: 'dist', mainFileName: 'main.js' }),
 * };
 */
export function bffRollupOutput(options: {
  dir: string;
  mainFileName?: string;
  format?: 'cjs' | 'esm';
}): OutputOptions {
  const { dir, mainFileName = 'main.js', format = 'cjs' } = options;

  return {
    dir,
    format,
    sourcemap: true,
    entryFileNames: (chunkInfo) => {
      if (chunkInfo.name === 'main' || chunkInfo.name === 'index') {
        return mainFileName;
      }
      // Convert dash-separated function names to directory paths
      return chunkInfo.name.split('-').join('/') + '.js';
    },
  };
}
