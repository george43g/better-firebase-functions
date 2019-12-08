/* eslint-disable global-require */
/* eslint-disable max-len */
import { resolve } from 'path';

import set from 'lodash.set';

import glob = require('glob');

/**
 * This function will search the given directory using provided glob matching pattern.
 * All matching files will then be checked for a default export. The filename and path is
 * used to determine the function name on deployment.
 *
 * You can set the glob pattern to only pick up files that end in *.cf.js or *.function.js
 * Be sure to use `js` as your file extension when matching if you are using Typescript
 *
 * @param glob `string` the glob pattern to search `dir` for function files
 * @param dir `string` the directory to search in.
 * @returns `exports` object - just do exports = exportCloudFunctions...
 *
 * @example import exportCloudFunctions from 'better-firebase-functions'
 * exports = exportCloudFunctions(__dirname, __filename, exports, './', GLOB_PATTERN);
 */
export default (__dirname: string, __filename: string, exports:any, dir?: string, globPattern?: string) => {
  const funcDir = dir || './';
  const pat = globPattern || './**/*.js';
  const files = glob.sync(pat, { cwd: resolve(__dirname, funcDir) });
  // eslint-disable-next-line no-restricted-syntax
  for (const file of files) {
    const path = resolve(__dirname, file);
    // eslint-disable-next-line no-continue
    if (path.slice(0, -3) === __filename.slice(0, -3)) continue; // Prevent exporting this file if present
    const filePath = path.substr(__dirname.length + 1); /* ? */
    const funcName = filePath.replace(/\//g, '-').slice(0, -3); /* ? */
    const propPath = funcName.replace(/-/g, '.'); /* ? */
    if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === funcName) {
      // eslint-disable-next-line import/no-dynamic-require
      const module = require(resolve(__dirname, funcDir, filePath));
      // eslint-disable-next-line no-continue
      if (!module.default) continue;
      set(exports, propPath, module.default);
    }
  }
  return exports;
};
