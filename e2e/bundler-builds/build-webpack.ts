/**
 * webpack smoke-test build.
 * Run from: npx tsx e2e/bundler-builds/build-webpack.ts [outdir]
 */
import { resolve } from 'path';
import webpack from 'webpack';
import { BffWebpackPlugin } from '../../packages/webpack/dist/index.js';

const outdir = process.argv[2] || resolve(__dirname, '../functions-bundled/lib-webpack');
const entryPoint = resolve(__dirname, '../functions-bundled/src/index.ts');

process.env.BFF_BUNDLER_NAME = 'webpack';

const resolvedOutdir = resolve(process.cwd(), outdir);

webpack(
  {
    target: 'node',
    mode: 'production',
    entry: entryPoint,
    output: {
      path: resolvedOutdir,
      libraryTarget: 'commonjs2',
      filename: '[name].js',
    },
    resolve: { extensions: ['.ts', '.js'] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              compiler: resolve(__dirname, '../functions-bundled/node_modules/typescript'),
              configFile: resolve(__dirname, '../functions-bundled/tsconfig.json'),
              context: resolve(__dirname, '../functions-bundled'),
            },
          },
          exclude: /node_modules/,
        },
      ],
    },
    externals: {
      'firebase-admin': 'commonjs firebase-admin',
      'firebase-functions': 'commonjs firebase-functions',
      'firebase-admin/app': 'commonjs firebase-admin/app',
      'firebase-admin/firestore': 'commonjs firebase-admin/firestore',
      'firebase-functions/v2/https': 'commonjs firebase-functions/v2/https',
    },
    optimization: { minimize: false },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.BFF_BUNDLER_NAME': '"webpack"',
      }),
      new BffWebpackPlugin({
        entryPoint,
        outputFileName: 'main.js',
        verbose: true,
      }),
    ],
  },
  (err, stats) => {
    if (err) {
      console.error('[bff-webpack-smoke] fatal error:', err);
      process.exit(1);
    }
    if (stats?.hasErrors()) {
      console.error(stats.toString({ errors: true }));
      process.exit(1);
    }
    const assets = Object.keys(stats?.compilation?.assets ?? {});
    console.log(`[bff-webpack-smoke] bundled ${assets.length} outputs → ${resolvedOutdir}`);
    console.log('  assets:', assets);
  },
);
