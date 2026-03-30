/**
 * esbuild smoke-test build script.
 * Reads runtime config from the BFF entry point automatically via build-discovery mode.
 */
import { buildFunctions } from 'better-firebase-functions-esbuild';
import { resolve } from 'path';

void (async () => {
  const outdir = resolve(__dirname, 'lib-esbuild');

  const result = await buildFunctions({
    entryPoint: resolve(__dirname, 'src/index.ts'),
    outdir,
    target: 'node20',
    verbose: true,
    esbuildOptions: {
      // Externalise all Firebase / Node deps — installed on Cloud Functions runtime
      external: ['firebase-admin', 'firebase-functions', 'firebase-admin/*', 'firebase-functions/*'],
    },
  });

  console.log(
    `[bff-esbuild-smoke] bundled ${Object.keys(result.entryPoints).length} functions to ${outdir}`,
  );
  console.log('  entry points:', result.buildEntryPoints);
})();
