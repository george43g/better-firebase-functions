declare const _default: (__dirname: string, __filename: string, exports: any, dir?: string, globPattern?: string) => any;
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
export default _default;
