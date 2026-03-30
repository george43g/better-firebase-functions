import { exportFunctions } from 'better-firebase-functions';

// Entry point for the bundler smoke-test codebase.
// Intentionally uses a custom searchGlob (*.func.js, not the default *.{js,ts})
// to exercise the bundler plugin's automatic glob-expansion from .js → .{js,ts}.
const functions = exportFunctions({
  __filename,
  exports: {},
  functionDirectoryPath: './triggers',
  searchGlob: '**/*.func.js',
  funcNameFromRelPath: () => {
    // The smoke codebase intentionally contains a single trigger.
    // Give each bundler a unique exported function name so Firebase codebases
    // can coexist in the same project without collisions.
    const bundler = process.env.BFF_BUNDLER_NAME || 'unknown';
    return `bundler${bundler.charAt(0).toUpperCase() + bundler.slice(1)}Smoke`;
  },
  enableLogger: true,
});

module.exports = functions;
