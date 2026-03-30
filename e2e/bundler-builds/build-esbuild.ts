/**
 * esbuild smoke-test build.
 * Run from: npx tsx e2e/bundler-builds/build-esbuild.ts [outdir]
 */
import { buildFunctions } from '../../packages/esbuild/dist/index.js';
import { resolve } from 'path';

void (async () => {
  process.env.BFF_BUNDLER_NAME = 'esbuild';

  const outdir = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(__dirname, '../functions-bundled/lib-esbuild');
  const entryPoint = resolve(__dirname, '../functions-bundled/src/index.ts');

  const result = await buildFunctions({
    entryPoint,
    outdir,
    target: 'node20',
    verbose: true,
    esbuildOptions: {
      define: {
        'process.env.BFF_BUNDLER_NAME': '"esbuild"',
      },
      external: ['firebase-admin', 'firebase-functions', 'firebase-admin/*', 'firebase-functions/*'],
    },
  });

  console.log(`[bff-esbuild-smoke] bundled ${Object.keys(result.entryPoints).length} functions → ${outdir}`);
})();
