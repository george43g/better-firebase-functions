/* eslint-disable no-continue */
import { resolve } from 'path';
import set from 'lodash.set';
import camelCase from 'camelcase';
import glob from 'glob';

const msg = [
  'THIS METHOD HAS BEEN DEPRECATED',
  'Please use the simpler, faster and more configurable exportFunctions() function.',
].join('\n');

const funcNameFromRelPath = (relpath: string): string => {
  const relPath = relpath;
  const relPathArray = relPath.split('/'); /* ? */
  const fileName = relPathArray.pop(); /* ? */
  const relDirPathFunctionNameChunk = relPathArray.map((pathFragment) => camelCase(pathFragment)).join('/');
  const fileNameFunctionNameChunk = camelCase(fileName!.split('.')[0]);
  const funcName = relDirPathFunctionNameChunk
    ? `${relDirPathFunctionNameChunk}/${fileNameFunctionNameChunk}`
    : fileNameFunctionNameChunk;
  return funcName.replace(/\//g, '-');
};

/**
 * @deprecated as of version 3.1.2 - use exportFunctions() instead
 *
 * This function will search the given directory using provided glob matching pattern and
 * export firebase cloud functions for you automatically, without you having to require
 * each file individually. It also applies speed optimisations for cold-start.
 *
 * All matching files will then be checked for a default export. The filename and path is
 * used to determine the function name on deployment.
 *
 * You can set the glob pattern to only pick up files that end in *.cf.js or *.function.js
 * Be sure to use `js` as your file extension when matching if you are using Typescript
 *
 * @param globPattern `string` the glob pattern to search `dir` for function files
 * @param dir `string` the directory to search in.
 * @returns `exports` object - just do exports = exportCloudFunctions...
 *
 * @example import exportCloudFunctions from 'better-firebase-functions'
 * exportCloudFunctions(__dirname, __filename, exports, './', GLOB_PATTERN);
 */
export default function (__dirname: string, __filename: string, exports: any, dir?: string, globPattern?: string) {
  // eslint-disable-next-line no-console
  console.warn(msg);
  const funcDir = dir || './';
  const pat = globPattern || './**/*.js';
  const files = glob.sync(pat, { cwd: resolve(__dirname, funcDir) });
  // eslint-disable-next-line no-restricted-syntax
  for (const file of files) {
    const absPath = resolve(__dirname, funcDir, file);
    if (absPath.slice(0, -2) === __filename.slice(0, -2)) continue; // Prevent exporting self
    const absFuncDir = resolve(__dirname, funcDir);
    const relPath = absPath.substr(absFuncDir.length + 1); /* ? */
    const funcName = funcNameFromRelPath(relPath); /* ? */
    const propPath = funcName.replace(/-/g, '.'); /* ? */
    if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === funcName) {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const module = require(resolve(__dirname, funcDir, relPath));
      if (!module.default) continue;
      set(exports, propPath, module.default);
    }
  }
  return exports;
}
