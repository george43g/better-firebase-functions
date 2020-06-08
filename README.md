# better-firebase-functions

The main feature of this package is a function that provides a better way of automatically exporting function triggers
in Firebase Cloud Functions. This method will almost always improve the performance, memory usage and cold-boot time of
your cloud functions, especially in large projects. It also allows for a more scalable file structure for your source
code directory.

This package is bundled into one module with 0 dependencies, and is designed to be as lightweight, configurable and
reliable/redundant as possible. Suitable for production use in almost any project. Only one feature is available in this
package to keep the bundle size as small as possible for performance reasons.

## Installation

Simply install from NPM:

```sh
npm install better-firebase-functions
```

1. Ensure your main entry point file contains only:

```typescript
// src/index.ts
import { exportFunctions } from 'better-firebase-functions';

exportFunctions({ __filename, exports });
```

2. Ensure your function triggers are structured like this:

```typescript
// src/auth/on-create.ts
import * as functions from 'firebase-functions';

export default functions.auth.user().onCreate(/* Function */);
```

## exportFunctions()

This function has two main features:

1. Automatically export all function triggers from your index file, without having to manually import each module.

2. Function triggers are exported in a special way that increases performance and reduces cold-boot time of your cloud
   functions.

_More info:_

- Functions are automatically named after their path from the root functions directory.
- Rename a function by renaming a file.
- Automatically create function groups based on directory structure, allowing for `--only functions: groupA` deploys.

For JS projects that cant use `export default` syntax, just use equivalent `module.exports.default = ...`.

This function scans a directory for modules (_.js files), then exports them automatically. It exports each found
module's `default` export (`export default _`or`module.exports.default = \*`). Each file should contain one function
trigger and export it as the default export. Almost every default behaviour can be customised by the settings object.

### exportFunctions() Usage

In your main entry point file, simply include these two lines of code:

```typescript
/// entry point, index.js/ts
import { exportFunctions } from 'better-firebase-functions';
exportFunctions({ __filename, exports });
```

The function will export all found triggers from your index file.

And then in your modules, define your function triggers:

```ts
/// ./http/new-user.func.ts
import * as functions from 'firebase-functions'
export default functions.https.onRequest(app)...
```

The above function will automatically be exported as `http-newUser`, because it is in a directory called `http` and is
in a file called `new-user.func.ts`. The dash `http-` denotes that the function is in a submodule group called `http`,
meaning the functions found in the `http` directory can be exported using `firebase deploy --only functions: http`.

#### How it Works

exportFunctions() will search the given directory using provided glob matching pattern and export firebase cloud
functions for you automatically, without you having to require each file individually. All matching files will then be
checked for a default export. The filename and path is used to determine the function name. The function triggers are
nested on the exports object to mirror the folder structure, allowing for deployment groups. You can set the glob
pattern to only pick up files that end in _.cf.js or _.function.js Be sure to _still_ use `js` as your file extension
when matching if you are using Typescript as this code is executed at runtime once the files are compiled.

### Settings Object

#### logger : object, enableLogger: boolean

You may specify a custom log function, and enable/disable performance logging.

#### funcNameFromRelPath : method

You may provide a custom function for generating function names based on the file path the module was found. The input
is a string that is the relative path to the module, and the expected output is a string with the name of your function.
Submodules (module groups) are separated by a dash `-` and the names should be in camelCase. The input filenames should
be in kebab-case.

#### functionDirectoryPath : string

Provide a custom subdirectory to search for function triggers.

#### searchGlob: string

This is a glob pattern that allows you to define which files to search for.

#### extractTrigger: method

By passing this method you can customise how `exportFunctions()` gets the function trigger from the module. The default
behaviour is to look for the `default` export, but you may specify a different way such as a named export. The function
is given the module object and must return the function trigger.

#### exportPathMode: boolean

This flag will result in the export object holding the relative paths to the detected modules as values for the export
keys rather than the actual module or function trigger. This option is useful when using this package as part of a build
process or for debugging.

### Other Options

The provided typings contain jsdoc comments that should provide intellisense about the various configuration options
available and how to use them.

#### If my tests are in the same directory

As long as your test files do not provide a default export, they won't be included in the export. Otherwise, you can use
glob patterns to only include certain files (`*.func.js`).

You can now also control how the function trigger export is "found" from each module file. For example, instead of using
a default export, you can opt to use a named export called `export const functionTrigger = functions...`.

### Warnings

Try to avoid collisions, where two modules are exported to the same path.

This module does its best to convert dashes in files to camelCase and multi-extensions on files `user.function.js` to
valid names, so as to avoid misnaming a function.

You can use the glob pattern to specify which files to target, but be careful: `user.test.js & user.function.js`, if
they are both included accidentally, will collide with each other as they are both called `user` and the extension is
stripped away (provided they both have a default export)

If you need both files, then you can optionally change their names to use camelCase or use a dash `-` (which are also
automatically converted to camelCase) leaving only the dot in .js.

#### Node 8

If you are using Firebase Functions in Node v8, then the master branch will not work with default settings. The
funcNameFromRelPath method uses a dependency called `camelCase` which crashes in v8. There is a specific branch for Node
v8 called `node8` that can be installed via `npm install git@github.com:gramstr/better-firebase-functions.git#node8`

## Contribute

Please contribute to this project by submitting a pull request. Use Commitizen to generate correct commit messages.
