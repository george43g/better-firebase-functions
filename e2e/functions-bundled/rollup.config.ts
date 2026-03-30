/**
 * Rollup smoke-test build config.
 * Reads runtime config from the BFF entry point automatically via build-discovery mode.
 */
import { resolve } from 'path';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { bffRollupPlugin, bffRollupOutput } from 'better-firebase-functions-rollup';

const outdir = resolve(__dirname, 'lib-rollup');

export default {
  input: resolve(__dirname, 'src/index.ts'),
  output: bffRollupOutput({ dir: outdir, mainFileName: 'main.js', format: 'cjs' }),
  external: [
    'firebase-admin',
    'firebase-functions',
    /^firebase-admin\//,
    /^firebase-functions\//,
  ],
  plugins: [
    bffRollupPlugin({
      entryPoint: resolve(__dirname, 'src/index.ts'),
      verbose: true,
    }),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    typescript({ tsconfig: resolve(__dirname, 'tsconfig.json') }),
  ],
};
