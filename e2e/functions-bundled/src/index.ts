import { exportFunctions } from 'better-firebase-functions';

// Entry point for the bundler smoke-test codebase.
// Intentionally uses a custom searchGlob (*.func.js, not the default *.{js,ts})
// to exercise the bundler plugin's automatic glob-expansion from .js → .{js,ts}.
exportFunctions({
  __filename,
  exports,
  functionDirectoryPath: './triggers',
  searchGlob: '**/*.func.js',
  enableLogger: true,
});
