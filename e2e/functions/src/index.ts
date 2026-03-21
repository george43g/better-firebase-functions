import { exportFunctions } from 'better-firebase-functions';

// This is the entry point for Firebase Cloud Functions.
// exportFunctions() will automatically discover all function triggers
// in the ./triggers directory and export them.
exportFunctions({
  __filename,
  exports,
  functionDirectoryPath: './triggers',
  searchGlob: '**/*.func.js',
  enableLogger: true,
});
