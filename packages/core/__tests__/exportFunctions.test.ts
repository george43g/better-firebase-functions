import { mkdirSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname, sep } from "path";
import { tmpdir } from "os";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import * as bff from "../src/export-functions";
import { camelCase } from "../src/utils/camelcase";
import { setPath } from "../src/utils/set-path";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function generateTestDir(
  dirPath: string,
  filePaths: string[],
  fileContents: string,
) {
  for (const filePath of filePaths) {
    if (filePath.endsWith("/")) {
      mkdirSync(resolve(dirPath, filePath), { recursive: true });
    } else {
      const fullPath = resolve(dirPath, filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, fileContents);
    }
  }
}

function filePathToPropertyPath(moduleFilePath: string): string {
  const funcName = bff.funcNameFromRelPathDefault(moduleFilePath);
  return funcName.split("-").join(".");
}

// ---------------------------------------------------------------------------
// Unit tests: camelCase utility
// ---------------------------------------------------------------------------

describe("camelCase utility", () => {
  it("converts kebab-case", () => {
    expect(camelCase("my-function")).toBe("myFunction");
  });

  it("converts snake_case", () => {
    expect(camelCase("my_function")).toBe("myFunction");
  });

  it("lowercases leading uppercase", () => {
    expect(camelCase("MyFunction")).toBe("myFunction");
  });

  it("handles single word", () => {
    expect(camelCase("sample")).toBe("sample");
  });

  it("handles multiple separators", () => {
    expect(camelCase("get-all-users")).toBe("getAllUsers");
  });
});

// ---------------------------------------------------------------------------
// Unit tests: setPath utility
// ---------------------------------------------------------------------------

describe("setPath utility", () => {
  it("sets a shallow property", () => {
    const obj: Record<string, any> = {};
    setPath(obj, ["foo"], 42);
    expect(obj).toEqual({ foo: 42 });
  });

  it("sets a deeply nested property", () => {
    const obj: Record<string, any> = {};
    setPath(obj, ["a", "b", "c"], "deep");
    expect(obj).toEqual({ a: { b: { c: "deep" } } });
  });

  it("preserves existing properties", () => {
    const obj: Record<string, any> = { a: { existing: true } };
    setPath(obj, ["a", "new"], "val");
    expect(obj).toEqual({ a: { existing: true, new: "val" } });
  });

  it("returns the same object reference", () => {
    const obj: Record<string, any> = {};
    const result = setPath(obj, ["x"], 1);
    expect(result).toBe(obj);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: funcNameFromRelPathDefault
// ---------------------------------------------------------------------------

describe("funcNameFromRelPathDefault", () => {
  it("converts a simple filename", () => {
    expect(bff.funcNameFromRelPathDefault("sample.func.ts")).toBe("sample");
  });

  it("converts kebab-case filename to camelCase", () => {
    expect(bff.funcNameFromRelPathDefault("camel-case-func.func.ts")).toBe(
      "camelCaseFunc",
    );
  });

  it("includes directory as group prefix", () => {
    expect(bff.funcNameFromRelPathDefault(`folder${sep}new.func.ts`)).toBe(
      "folder-new",
    );
  });

  it("handles deeply nested paths", () => {
    expect(
      bff.funcNameFromRelPathDefault(
        `folder${sep}nestedFolder${sep}sample-func.func.ts`,
      ),
    ).toBe("folder-nestedFolder-sampleFunc");
  });
});

// ---------------------------------------------------------------------------
// Integration tests: exportFunctions
// ---------------------------------------------------------------------------

describe("exportFunctions() integration test suite", () => {
  const testFiles = [
    "pretend-index.ts",
    "sample.func.ts",
    "camel-case-func.func.ts",
    "./empty-folder/",
    "folder/new.func.ts",
    "folder/not-a-func.ts",
    "folder/nestedFolder/sample-func.func.ts",
    "folder/nestedFolder/sample-js-func.func.js",
  ];

  const tempFuncDir = resolve(
    tmpdir(),
    `bff-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const randOutput = Math.floor(Math.random() * 100) + 1;

  beforeAll(() => {
    generateTestDir(
      tempFuncDir,
      testFiles,
      `module.exports = { default: ${randOutput} };`,
    );
  });

  beforeEach(() => {
    delete process.env[bff.BFF_BUILD_DISCOVERY_ENV_VAR];
    delete process.env.FUNCTION_TARGET;
    delete process.env.K_SERVICE;
    delete process.env.FUNCTION_NAME;
  });

  afterAll(() => {
    rmSync(tempFuncDir, { recursive: true, force: true });
  });

  const exportTestFactory = (configObj?: Record<string, any>) =>
    bff.exportFunctions({
      __dirname: tempFuncDir,
      __filename: `${tempFuncDir}/pretend-index.ts`,
      exports: {},
      searchGlob: "**/*.func.{ts,js}",
      ...configObj,
    });

  // ---- Core functionality ----

  it("should not export itself", () => {
    expect(exportTestFactory()).not.toHaveProperty(
      filePathToPropertyPath(testFiles[0]),
    );
  });

  it("should export from the default export of each submodule", () => {
    expect(exportTestFactory()).toHaveProperty(
      filePathToPropertyPath(testFiles[1]),
      randOutput,
    );
  });

  it("should properly nest submodules found in directories", () => {
    expect(exportTestFactory()).toHaveProperty(
      filePathToPropertyPath(testFiles[4]),
      randOutput,
    );
    expect(exportTestFactory()).not.toHaveProperty(
      filePathToPropertyPath(testFiles[3]),
      randOutput,
    );
    expect(exportTestFactory()).toHaveProperty(
      filePathToPropertyPath(testFiles[6]),
      randOutput,
    );
  });

  it("should correctly apply camelCase to kebab-case named files", () => {
    expect(exportTestFactory()).toHaveProperty(
      filePathToPropertyPath(testFiles[2]),
      randOutput,
    );
  });

  it("should not export files that do not match the glob pattern", () => {
    expect(exportTestFactory()).not.toHaveProperty(
      filePathToPropertyPath(testFiles[5]),
    );
  });

  // ---- Custom function name generator ----

  it("should call custom function name generator when provided", () => {
    const funcGenSpy = vi.fn(bff.funcNameFromRelPathDefault);
    exportTestFactory({ funcNameFromRelPath: funcGenSpy });
    expect(funcGenSpy).toHaveBeenCalled();
  });

  // ---- __dirname derivation ----

  it("should work without explicit __dirname (derived from __filename)", () => {
    const result = exportTestFactory({
      __dirname: undefined,
      enableLogger: true,
    });
    expect(result).toHaveProperty(
      filePathToPropertyPath(testFiles[1]),
      randOutput,
    );
  });

  // ---- Cold-start optimization: K_SERVICE (Gen 2) ----

  it("should only load the matching module when K_SERVICE is set (Gen 2)", () => {
    process.env.K_SERVICE = bff.funcNameFromRelPathDefault(testFiles[1]);
    const result = exportTestFactory({ enableLogger: true });
    expect(result).not.toHaveProperty(filePathToPropertyPath(testFiles[2]));
    expect(result).toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("should match lowercased K_SERVICE service names from Cloud Run (Gen 2)", () => {
    process.env.K_SERVICE = "camelcasefunc";
    const result = exportTestFactory({ enableLogger: true });
    expect(result).toHaveProperty(filePathToPropertyPath(testFiles[2]));
    expect(result).not.toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(Object.keys(result)).toHaveLength(1);
  });

  // ---- Cold-start optimization: FUNCTION_NAME (Gen 1) ----

  it("should only load the matching module when FUNCTION_NAME is set (Gen 1)", () => {
    process.env.FUNCTION_NAME = bff.funcNameFromRelPathDefault(testFiles[1]);
    const result = exportTestFactory({ enableLogger: true });
    expect(result).not.toHaveProperty(filePathToPropertyPath(testFiles[2]));
    expect(result).toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("should prefer FUNCTION_TARGET when present (Functions Framework / Gen 2)", () => {
    process.env.FUNCTION_NAME = `projects/test/databases/(default)/documents/${bff.funcNameFromRelPathDefault(
      testFiles[2],
    )}`;
    process.env.FUNCTION_TARGET = bff.funcNameFromRelPathDefault(testFiles[1]);
    const result = exportTestFactory({ enableLogger: true });
    expect(result).toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(result).not.toHaveProperty(filePathToPropertyPath(testFiles[2]));
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("should match FUNCTION_NAME values containing full resource paths", () => {
    process.env.FUNCTION_NAME = `projects/test/locations/us-central1/functions/${bff.funcNameFromRelPathDefault(
      testFiles[2],
    )}`;
    const result = exportTestFactory({ enableLogger: true });
    expect(result).toHaveProperty(filePathToPropertyPath(testFiles[2]));
    expect(result).not.toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(Object.keys(result)).toHaveLength(1);
  });

  // ---- Nested function cold-start ----

  it("should load the correct module for a nested function name", () => {
    process.env.K_SERVICE = "folder-new";
    const result = exportTestFactory();
    expect(result).toHaveProperty("folder.new", randOutput);
    expect(Object.keys(result)).toHaveLength(1);
  });

  // ---- Glob flexibility ----

  it("should work with glob patterns that prepend ./", () => {
    expect(exportTestFactory({ searchGlob: "./**/*.func.ts" })).toHaveProperty(
      filePathToPropertyPath(testFiles[1]),
    );
    expect(exportTestFactory({ searchGlob: "**/*.func.ts" })).toHaveProperty(
      filePathToPropertyPath(testFiles[1]),
    );
  });

  // ---- Export path mode (for build tools) ----

  it("should export file paths in exportPathMode", () => {
    const output = exportTestFactory({ exportPathMode: true });
    expect(output).toHaveProperty(
      filePathToPropertyPath(testFiles[4]),
      testFiles[4].replace(/\//g, sep),
    );
  });

  it("should detect both .js and .ts files", () => {
    const output = exportTestFactory({ exportPathMode: true });
    expect(output).toHaveProperty(
      filePathToPropertyPath(testFiles[7]),
      testFiles[7].replace(/\//g, sep),
    );
  });

  it("should expose build discovery metadata without loading trigger modules", () => {
    process.env[bff.BFF_BUILD_DISCOVERY_ENV_VAR] = "1";
    const result = exportTestFactory({ searchGlob: "**/*.func.js" });
    const discovery = result[
      bff.BFF_DISCOVERY_EXPORT_KEY
    ] as bff.BffBuildDiscovery;

    expect(discovery).toBeDefined();
    expect(discovery.entries.sample.sourceRelativePath).toBe(`sample.func.ts`);
    expect(discovery.entries.sample.runtimeRelativePath).toBe(`sample.func.js`);
    expect(discovery.entries.sample.outputRelativePath).toBe(`sample.func.js`);
    expect(discovery.entries.sample.outputEntryName).toBe(`sample.func`);
    expect(result).not.toHaveProperty("sample");
  });

  // ---- Custom extractTrigger ----

  it("should use custom extractTrigger function", () => {
    const result = exportTestFactory({
      extractTrigger: (mod: any) =>
        mod?.default ? `wrapped-${mod.default}` : null,
    });
    expect(result).toHaveProperty(
      filePathToPropertyPath(testFiles[1]),
      `wrapped-${randOutput}`,
    );
  });

  // ---- Error resilience ----

  it("should continue loading other modules if one fails", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = exportTestFactory({
      extractTrigger: (mod: any, funcName?: string) => {
        if (funcName === undefined && mod?.default) return mod.default;
        return mod?.default;
      },
    });
    // Should still have exports even if some modules might fail
    expect(Object.keys(result).length).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Integration tests: exportFunctionsAsync
// ---------------------------------------------------------------------------

describe("exportFunctionsAsync() async test suite", () => {
  const testFiles = ["async-sample.func.ts"];
  const tempFuncDir = resolve(
    tmpdir(),
    `bff-async-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const randOutput = Math.floor(Math.random() * 100) + 1;

  beforeAll(() => {
    generateTestDir(
      tempFuncDir,
      testFiles,
      `module.exports = { default: ${randOutput} };`,
    );
  });

  beforeEach(() => {
    delete process.env[bff.BFF_BUILD_DISCOVERY_ENV_VAR];
    delete process.env.FUNCTION_TARGET;
    delete process.env.K_SERVICE;
    delete process.env.FUNCTION_NAME;
  });

  afterAll(() => {
    rmSync(tempFuncDir, { recursive: true, force: true });
  });

  it("should load modules asynchronously and populate exports", async () => {
    const result = await bff.exportFunctionsAsync({
      __dirname: tempFuncDir,
      __filename: `${tempFuncDir}/pretend-index.ts`,
      exports: {},
      searchGlob: "**/*.func.{ts,js}",
    });
    expect(result).toHaveProperty("asyncSample", randOutput);
  });

  it("should expose build discovery metadata in async mode", async () => {
    process.env[bff.BFF_BUILD_DISCOVERY_ENV_VAR] = "1";
    const result = await bff.exportFunctionsAsync({
      __dirname: tempFuncDir,
      __filename: `${tempFuncDir}/pretend-index.ts`,
      exports: {},
      searchGlob: "**/*.func.js",
    });

    const discovery = result[
      bff.BFF_DISCOVERY_EXPORT_KEY
    ] as bff.BffBuildDiscovery;
    expect(discovery.entries.asyncSample.runtimeRelativePath).toBe(
      `async-sample.func.js`,
    );
  });
});

// ---------------------------------------------------------------------------
// Build discovery tests
// ---------------------------------------------------------------------------

describe("discoverFunctionPaths()", () => {
  const testFiles = [
    "pretend-index.ts",
    "folder/new.func.ts",
    "folder/nestedFolder/sample-func.func.ts",
  ];
  const tempFuncDir = resolve(
    tmpdir(),
    `bff-discovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  beforeAll(() => {
    generateTestDir(
      tempFuncDir,
      testFiles,
      `module.exports = { default: true };`,
    );
  });

  afterAll(() => {
    rmSync(tempFuncDir, { recursive: true, force: true });
  });

  it("should preserve runtime-relative output paths under functionDirectoryPath", () => {
    const discovery = bff.discoverFunctionPaths({
      __dirname: tempFuncDir,
      __filename: `${tempFuncDir}/pretend-index.ts`,
      functionDirectoryPath: "./folder",
      searchGlob: "**/*.func.js",
    });

    expect(discovery.functionDirectoryPath).toBe("folder");
    expect(discovery.entries.new.outputRelativePath).toBe(
      `folder${sep}new.func.js`,
    );
    expect(
      discovery.entries["nestedFolder-sampleFunc"].outputRelativePath,
    ).toBe(`folder${sep}nestedFolder${sep}sample-func.func.js`);
  });

  it("should derive custom function names from runtime paths, not source paths", () => {
    const discovery = bff.discoverFunctionPaths({
      __dirname: tempFuncDir,
      __filename: `${tempFuncDir}/pretend-index.ts`,
      searchGlob: "**/*.func.js",
      funcNameFromRelPath: (relPath) => relPath.split(sep).join("/"),
    });

    expect(discovery.entries["folder/new.func.js"]).toBeDefined();
    expect(discovery.entries["folder/new.func.js"].sourceRelativePath).toBe(
      `folder${sep}new.func.ts`,
    );
  });
});
