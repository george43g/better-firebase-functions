/**
 * Rollup smoke-test build.
 * Run from: npx tsx e2e/bundler-builds/build-rollup.ts [outdir]
 */
import { resolve } from 'path';
import { rollup } from 'rollup';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { bffRollupPlugin, bffRollupOutput } from '../../packages/rollup/dist/index.js';

void (async () => {
  const outdir = process.argv[2] || resolve(__dirname, '../functions-bundled/lib-rollup');
  const entryPoint = resolve(__dirname, '../functions-bundled/src/index.ts');

  const outputOptions = bffRollupOutput({ dir: outdir, mainFileName: 'main.js', format: 'cjs' });

  const bundle = await rollup({
    input: entryPoint,
    external: [
      'firebase-admin',
      'firebase-functions',
      /^firebase-admin\//,
      /^firebase-functions\//,
    ],
    plugins: [
      bffRollupPlugin({ entryPoint, verbose: true }),
      nodeResolve({ preferBuiltins: true }),
      commonjs(),
      typescript({
        tsconfig: resolve(__dirname, '../functions-bundled/tsconfig.json'),
        compilerOptions: {
          module: 'esnext',
          moduleResolution: 'bundler',
          outDir: outdir,
        },
      }),
    ],
    onwarn(warning) {
      if (warning.code === 'UNRESOLVED_IMPORT') return;
      process.stderr.write(`[rollup] ${warning.message}\n`);
    },
  });

  await bundle.write(outputOptions);
  console.log(`[bff-rollup-smoke] bundled to ${outdir}`);
})();
