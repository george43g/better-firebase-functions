# better-firebase-functions

This repo provides a default export function for a better way of automatically exporting function triggers in Firebase Cloud Functions.

## tl;dr

- Automatically find/bundle/sort/export all of your cloud functions from multiple directories without having to manually require each file.
- Faster cold-start times for your cloud functions.
- Lower memory-use.
- Simpler dependency lazy-loading.
- Automated exports of function names based on dir/filename.
- Freedom to structure your project in nested directories.
- Freedom to easily change and rearrange your file structure without having.
- Rename a function by renaming a file.
- Automatically create function groups based on directory structure, allowing for `--only functions: groupA` deploys.

## Usage

Getting this right is pretty simple, just avoid a few common pitfalls:

```typescript
/// entry point, index.js/ts
import exportCloudFunctions from 'better-firebase-functions'
exportCloudFunctions(__dirname, __filename, exports, './', './**/*.js') // You should probably always match .js
```

```ts
/// ./auth/newUser.ts
import * as functions from 'firebase-functions'
export default functions.https.onRequest(app)...
```

- The `__dirname, __filename, exports` parameters of the function should most likely remain that way, unless you know
what you're doing. They tell the function where to look, how to avoid exporting it's own file and to which object to attach
exports.
- The last two params are optional because they have defaults. By default, the module will export all default exports from
every .js file found in its containing directory and all subdirectories (onto a properly nested exports object).
- For JS projects that cant use `export default` syntax, just use equivalent `module.exports.default = ...`.

### Structure

- Ensure that each file that contains a cloud function only contains one cloud function.
- Each file that exports a cloud function must use `export default` syntax. If you are using JS instead of TS, you may just
use `module.exports.default` to mimic this behavior. The function will attach the default export of every function file
to the global export for Cloud Functions at the appropriate field path (key/sub-key of the object) onThe exports object.
- You may include additional functions in the same files that hold your cloud functions. You may also require
other files from your project, even within the same directories. This module will only attach default exports to your exports object.
- If you want to use default exports and you don't want them exported from your entry point file, you can use the glob pattern to
match files that end in, for example, `*.function.js` (please note, even if you work with .ts files, ensure your glob matches files after they have been transpiled for upload. This means you'll probably want to match `./**/*.js` files).
- You can set the root functions directory to be different from the entry point file. Some put all func files in a subdirectory.
Some choose to put their index.js in the root of the functions folder. Either way, you can use a combination of the `dir` and `glob` parameters to specify any functions files you want.
- This means you can arrange your project's files and directories however you like.
- Each directory is a function group you can choose to deploy on its own using the `--only functions: groupA.folderB` CLI syntax. In that
example, only functions found in a directory `folderB`, which is in directory `groupA`, which is in the specified root functions directory will be deployed.
- The module will automatically name your functions after the file name and containing directory names. Functions nested in directories will correspond to sub-properties in the exports object. So for example, a function found in `./auth/newUser.js` will be called `auth-newUser` and set to exports.auth.newUser - this is how the function groups can be automated by simple file structure.

## Benefits

There are a number of issues with the official way of deploying Firebase Cloud Functions. When there are many functions, the global
scope often becomes polluted, taking up more memory, slowing down functions and slowing down the cold-start time of each function
instance. As well as this, if you decide to lazy-load modules to mitigate this issue, it can become cumbersome to manually manage
global variables and instantiate modules when needed.

The way this module exposes functions and global scope to cloud functions means that each function invocation loads only exactly what
it needs for that one function instance, and nothing more. This keeps the module/global scope clean.

You can simply `import`/`require()` all the modules you need at the top of the file for each function. Because this module separates
the module scope of each function, the dependencies of one function will not be loaded when a different function instance is invocated.

This greatly reduces cold-boot times while simplifying and reducing the need to lazy-load cached global dependencies in the function instance' global scope.

## Warnings

Try to avoid collisions, where two modules are exported to the same path.

This module does its best to convert dashes in files to camelCase and multi-extensions on
files `user.function.js` to valid names, so as to avoid misnaming a function.

You can use the glob pattern to specify which files to target, but be careful:
`user.test.js & user.function.js`, if they are both included accidentally, will collide with each other
as they are both called `user` and the extension is stripped away.

If you need both files, then you can optionally change their names to use camelCase or use a dash `-` (which
are also automatically converted to camelCase) leaving only the dot in .js.

### Todo

- Implement Jest testing.
- Implement Semantic Release on Travis-Ci.
- Implement Greenkeeper.
- Husky / Commitlint git hooks, testing git hooks.
- Compile to the latest Node version supported by Firebase - 10.15.3, es2018.
- Better error handling and edge cases, console.error() errors.
- Performance review.

### Contribute

Please contribute to this project by submitting a pull request. Use Commitizen to generate correct commit messages.
