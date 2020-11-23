/* eslint-disable no-console, no-continue */
import camelCase from 'camelcase';
import glob from 'glob';
import set from 'lodash.set';
import { resolve, sep } from 'path';

function getDirnameFromFilename(__filename: string) {
  return __filename.split(sep).slice(0, -1).join(sep);
}

export function funcNameFromRelPathDefault(relPath: string): string {
  const relPathArray = relPath.split(sep); /* ? */
  const fileName = relPathArray.pop(); /* ? */
  const relDirPathFunctionNameChunk = relPathArray
    .map((pathFragment) => camelCase(pathFragment))
    .join("-");
  const fileNameFunctionNameChunk = camelCase(fileName!.split(".")[0]);
  const funcName = relDirPathFunctionNameChunk
    ? `${relDirPathFunctionNameChunk}-${fileNameFunctionNameChunk}`
    : fileNameFunctionNameChunk;
  return funcName;
}

/**
 * This is the exportFunctions() configuration object. It passes necessary information to enable
 * the function to work properly. Each parameter has its own documentation that should be visible
 * while you type.
 *
 * Some properties are required while others have built-in defaults.
 */
export interface ExportFunctionsConfig {
  /**
   * This is an absolute path to the directory which contains your main entry point
   * file that is calling this function. It has been named `__dirname` for convenience
   * as this is what it defaults to. This property is optional as it is derived
   * from the `__filename` property. You may wish to set this to something else if the
   * entry point happens to be in a deeper directory than your functions.
   *
   * The `searchDirectoryPath` property is relative to the absolute path provided here.
   * */
  __dirname?: string;

  /**
   * This is the absolute path to the file that calls exportFunctions(). It is called
   * __filename for convenience, as this is what you should set this to.
   * */
  __filename: string;

  /**
   * This is the exports object that will be consumed by Firebase. Named `exports` for
   * convenience as this is most likely what you will set this to.
   * */
  exports: any;

  /**
   * Relative path to functions directory.
   *
   * Path relative to current file. Function will perform glob search for function triggers
   * in this directory. This is relative to the path provided in __dirname or the file calling this function.
   * This property defaults to `./` to point to the same directory as the calling file.
   * */
  functionDirectoryPath?: string;

  /**
   * This is a glob pattern that defines which files' default exports are included in the
   * final function trigger export. This defaults to including all .js files in the
   * specified function directory (or it treats the directory calling the function as
   * the root functions directory). NOTE: You must include files as they are AFTER being
   * transpiled by Typescript, so with a .js glob match.
   *
   * You can use this to only include files with certain
   * extensions, such as:
   * @example
   * exportFunctions({__filename, exports, searchGlob: '** /*.func.js'}) (without space)
   * */
  searchGlob?: string;

  /**
   * You may choose to replace this function with your own if you'd like to control
   * how your function triggers get named. Any dashes '-' you output in each pathname
   * will result in a function group being created in Cloud Functions.
   * @param relativePath this function receives the full pathname of a file from function
   * directory root as string input
   *
   * @returns `string` function name is returned as a string
   */
  funcNameFromRelPath?(relativePath: string): string;

  /**
   * This function controls how the function trigger is found in the loaded module.
   * By default, An export called `default` is found on a CommonJS module. This mimmics
   * the behaviour of es6 modules using `export default`. You may customise this behaviour.
   * @param inputModule This object is the required CommonJS module that will be passed
   * as the only argument to this function.
   * @param currentFunctionName this is only present if run during a function invocation
   * rather than during deployment. It is useful if customising BFF to find more than
   * one trigger per file.
   * @returns must return the actual function trigger to be exported to firebase functions.
   * @example exportFunctions({extractTrigger: (obj) => obj['default']})
   */
  extractTrigger?: (inputModule: any, currentFunctionName?: string) => any;

  /**
   * Boolean value - wether to enable logging performance metrics
   */
  enableLogger?: boolean;

  /**
   * Optional custom log object - must contain timing functions equivalent to console.time()
   * and console.timeEnd() and console.log().
   */
  logger?: {
    time(msg: string): void;
    timeEnd(msg: string): void;
    log(msg: string): void;
    [key: string]: any;
  };

  /**
   * When enabled, the function only exports the module path as the value of each exports object key
   * Usefull for build tools or debugging
   */
  exportPathMode?: boolean;
}

const disabledLogger = {
  time(msg: string) {
    return msg;
  },
  timeEnd(msg: string) {
    return msg;
  },
  log(msg: string) {
    return msg;
  },
};

const getFunctionInstance = () => process.env.FUNCTION_NAME || process.env.K_SERVICE;
const isDeployment = () => !getFunctionInstance();
const funcNameMatchesInstance = (funcName: string) => funcName === getFunctionInstance();
const getTriggerFromModule = (inputModule: any) => inputModule?.default;

const coldModuleMsg = '[better-firebase-functions] Load Module (Cold-Start)';
const dirSearchMsg = '[better-firebase-functions] Directory Glob Search';
const deployMsg = '[better-firebase-functions] Load & Export Modules (Deployment)';

/**
 * This function will search the given directory using provided glob matching pattern and
 * export firebase cloud functions for you automatically, without you having to require
 * each file individually. It also applies speed optimisations for cold-start.
 *
 * All matching files will then be checked for a default export. The filename and path is
 * used to determine the function name on deployment.
 *
 * You can set the glob pattern to only pick up files that end in *.cf.js or *.function.js
 * Be sure to use `js` as your file extension when matching EVEN if you are using Typescript
 *
 * @param object ExportFunctionsConfig settings object
 * @returns `exports` object - this is done as a redundancy, as the exports object that is
 * passed in has properties set directly on it.
 *
 * @example import { exportFunctions } from 'better-firebase-functions'
 * exportFunctions({__filename, exports});
 * // OR
 * exportFunctions({__filename, exports, functionDirectoryPath: './app', searchGlob: '** /*.js' });
 */
export function exportFunctions({
  __filename,
  exports,
  functionDirectoryPath = './',
  searchGlob = '**/*.js',
  funcNameFromRelPath = funcNameFromRelPathDefault,
  enableLogger = false,
  logger = console,
  extractTrigger = getTriggerFromModule,
  __dirname,
  exportPathMode = false,
}: ExportFunctionsConfig) {
  const log = enableLogger ? logger : disabledLogger;
  const cwd = resolve(__dirname ?? getDirnameFromFilename(__filename), functionDirectoryPath); /* ? */
  log.time(dirSearchMsg);
  const files = glob.sync(searchGlob, { cwd }); /* ? */
  log.timeEnd(dirSearchMsg);

  const moduleSearchMsg = `[better-firebase-functions] Search for Module '${getFunctionInstance()}'`;
  if (isDeployment()) log.time(deployMsg);
  else log.time(moduleSearchMsg);

  // eslint-disable-next-line no-restricted-syntax
  for (const file of files) {
    const absPath = resolve(cwd, file);
    const standardRelativePath = absPath.substr(cwd.length + 1); /* ? */
    const funcName = funcNameFromRelPath(standardRelativePath); /* ? */
    if (isDeployment() || funcNameMatchesInstance(funcName)) {
      if (!isDeployment()) log.timeEnd(moduleSearchMsg);
      if (absPath.slice(0, -2) === __filename.slice(0, -2)) continue; // Prevent exporting self

      if (exportPathMode) {
        set(exports, funcName.replace(/-/g, '.'), standardRelativePath);
        continue;
      }
      if (!isDeployment()) log.time(coldModuleMsg);
      let funcTrigger: any;
      try {
        // eslint-disable-next-line no-eval
        const mod = eval('require')(absPath); // This is to preserve require call in webpack
        funcTrigger = extractTrigger(mod, getFunctionInstance());
      } catch (err) {
        console.error(err);
        continue;
      }
      if (!isDeployment()) log.timeEnd(coldModuleMsg);
      if (!funcTrigger) continue;
      const propPath = funcName.replace(/-/g, '.'); /* ? */
      set(exports, propPath, funcTrigger);
    }
  } // End loop

  if (isDeployment()) log.timeEnd(deployMsg);
  return exports;
}
