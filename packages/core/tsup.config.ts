import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  minify: true,
  bundle: true,
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  // Bundle all dependencies into the output (zero runtime dependencies)
  noExternal: [/.*/],
  // Preserve the eval('require') pattern for dynamic module loading
  banner: {
    js: '/* better-firebase-functions v7 | MPL-2.0 | github.com/george43g/better-firebase-functions */',
  },
});
