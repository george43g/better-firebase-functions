/**
 * webpack smoke-test build config.
 * Reads runtime config from the BFF entry point automatically via build-discovery mode.
 */
import { resolve } from 'path';
import { BffWebpackPlugin } from 'better-firebase-functions-webpack';

export default {
  target: 'node',
  mode: 'production' as const,
  entry: resolve(__dirname, 'src/index.ts'),
  output: {
    path: resolve(__dirname, 'lib-webpack'),
    libraryTarget: 'commonjs2',
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
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
  optimization: {
    minimize: false,
  },
  plugins: [
    new BffWebpackPlugin({
      entryPoint: resolve(__dirname, 'src/index.ts'),
      outputFileName: 'main.js',
      verbose: true,
    }),
  ],
};
