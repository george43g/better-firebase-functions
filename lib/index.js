"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable global-require */
/* eslint-disable max-len */
const path_1 = require("path");
const lodash_set_1 = __importDefault(require("lodash.set"));
const glob = require("glob");
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
exports.default = (__dirname, __filename, exports, dir, globPattern) => {
    const funcDir = dir || './';
    const pat = globPattern || './**/*.js';
    const files = glob.sync(pat, { cwd: path_1.resolve(__dirname, funcDir) });
    // eslint-disable-next-line no-restricted-syntax
    for (const file of files) {
        const path = path_1.resolve(__dirname, file);
        // eslint-disable-next-line no-continue
        if (path.slice(0, -3) === __filename.slice(0, -3))
            continue; // Prevent exporting this file if present
        const filePath = path.substr(__dirname.length + 1); /* ? */
        const funcName = filePath.replace(/\//g, '-').slice(0, -3); /* ? */
        const propPath = funcName.replace(/-/g, '.'); /* ? */
        if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === funcName) {
            // eslint-disable-next-line import/no-dynamic-require
            const module = require(path_1.resolve(__dirname, funcDir, filePath));
            // eslint-disable-next-line no-continue
            if (!module.default)
                continue;
            lodash_set_1.default(exports, propPath, module.default);
        }
    }
    return exports;
};
//# sourceMappingURL=index.js.map