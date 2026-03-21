import { resolve, sep } from 'path';
import type { BuildOptions, Plugin } from 'esbuild';
import { exportFunctions } from 'better-firebase-functions';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BffEsbuildPluginOptions {
  /**
   * Absolute path to the entry point file (index.ts/main.ts).
   * Used by exportFunctions() to discover function files.
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
   * Dependencies to externalize (not bundle). By default, reads from package.json.
   * Set to `true` to auto-read from package.json, or provide an explicit list.
   * @default true
   */
  external?: boolean | string[];

  /**
   * Node.js target version.
   * @default 'node18'
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

/**
 * Discover all function entry points using exportFunctions({ exportPathMode: true }).
 * Returns a flat map of { functionName: absoluteFilePath }.
 */
export function discoverFunctionEntryPoints(options: {
  entryPoint: string;
  functionDirectoryPath?: string;
  searchGlob?: string;
  funcNameFromRelPath?: (relPath: string) => string;
  verbose?: boolean;
}): Record<string, string> {
  const {
    entryPoint,
    functionDirectoryPath = './',
    searchGlob,
    funcNameFromRelPath,
    verbose = false,
  } = options;

  const entryDir = entryPoint.split(sep).slice(0, -1).join(sep);

  const exportsObj = exportFunctions({
    __filename: entryPoint,
    exports: {},
    functionDirectoryPath,
    searchGlob,
    funcNameFromRelPath,
    exportPathMode: true,
    enableLogger: verbose,
  });

  // Recursively flatten the nested exports object into { funcName: absolutePath }
  const entries: Record<string, string> = {};
  const rootDir = resolve(entryDir, functionDirectoryPath);

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
// esbuild plugin
// ---------------------------------------------------------------------------

/**
 * esbuild plugin that logs discovered Firebase Cloud Function entry points.
 *
 * NOTE: esbuild's plugin API does not support dynamically adding entry points.
 * For per-function bundling, use `buildFunctions()` instead — it calls esbuild
 * directly with the correct multi-entry configuration.
 *
 * This plugin is useful for monitoring/logging within an existing esbuild setup
 * where entry points are already configured via `discoverFunctionEntryPoints()`.
 *
 * @example
 * import { build } from 'esbuild';
 * import { discoverFunctionEntryPoints, bffEsbuildPlugin } from 'better-firebase-functions-esbuild';
 *
 * const entryPoints = discoverFunctionEntryPoints({
 *   entryPoint: resolve(__dirname, 'src/index.ts'),
 * });
 *
 * await build({
 *   entryPoints: { main: 'src/index.ts', ...entryPoints },
 *   outdir: 'dist',
 *   bundle: true,
 *   platform: 'node',
 *   plugins: [bffEsbuildPlugin({ entryPoint: resolve(__dirname, 'src/index.ts'), verbose: true })],
 * });
 */
export function bffEsbuildPlugin(options: BffEsbuildPluginOptions): Plugin {
  return {
    name: 'better-firebase-functions',
    setup(build) {
      const { verbose = false } = options;

      build.onStart(() => {
        if (verbose) {
          const entries = discoverFunctionEntryPoints(options);
          const count = Object.keys(entries).length;
          console.log(`[bff-esbuild] Discovered ${count} function entry points`);
          for (const [name, path] of Object.entries(entries)) {
            console.log(`  ${name} -> ${path}`);
          }
        }
      });

      build.onEnd(() => {
        if (verbose) {
          console.log('[bff-esbuild] Build complete.');
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
 *
 * Each function gets its own optimized CJS bundle with tree shaking.
 * Dependencies are externalized by default (they're installed on the
 * Cloud Functions runtime via package.json).
 *
 * @example
 * import { buildFunctions } from 'better-firebase-functions-esbuild';
 *
 * await buildFunctions({
 *   entryPoint: resolve(__dirname, 'src/index.ts'),
 *   functionDirectoryPath: './functions',
 *   outdir: 'dist',
 * });
 */
export async function buildFunctions(
  options: BffEsbuildPluginOptions & {
    /** Output directory for built functions. */
    outdir: string;
    /** Additional esbuild options to merge. */
    esbuildOptions?: Partial<BuildOptions>;
  },
): Promise<{ entryPoints: Record<string, string>; results: any[] }> {
  // Dynamic import to avoid requiring esbuild at module load time
  const esbuild = await import('esbuild');

  const {
    entryPoint,
    functionDirectoryPath,
    searchGlob,
    funcNameFromRelPath,
    external,
    target = 'node18',
    verbose = false,
    outdir,
    esbuildOptions = {},
  } = options;

  // Discover function entry points
  const entryPoints = discoverFunctionEntryPoints({
    entryPoint,
    functionDirectoryPath,
    searchGlob,
    funcNameFromRelPath,
    verbose,
  });

  if (verbose) {
    console.log(`[bff-esbuild] Found ${Object.keys(entryPoints).length} function entry points:`);
    for (const [name, path] of Object.entries(entryPoints)) {
      console.log(`  ${name} -> ${path}`);
    }
  }

  // Determine external dependencies
  let externals: string[] = [];
  if (external === true || external === undefined) {
    try {
      const entryDir = entryPoint.split(sep).slice(0, -1).join(sep);
      // eslint-disable-next-line no-eval
      const pkg = eval('require')(resolve(entryDir, 'package.json'));
      externals = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
      ];
    } catch {
      // No package.json found; bundle everything
    }
  } else if (Array.isArray(external)) {
    externals = external;
  }

  // Build each function entry point + the main entry point
  const allEntryPoints: Record<string, string> = {
    main: entryPoint,
    ...entryPoints,
  };

  const result = await esbuild.build({
    entryPoints: allEntryPoints,
    outdir,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target,
    treeShaking: true,
    external: externals,
    sourcemap: true,
    minify: false,
    ...esbuildOptions,
  });

  return { entryPoints: allEntryPoints, results: [result] };
}
