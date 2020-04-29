/* eslint-disable jest/no-hooks */
import fs from 'fs-extra';
import rimfar from 'rimraf';
import { resolve } from 'path';
import tmp from 'tmp';
import * as bff from '../src/export-functions';

function generateTestDir(dirPath: string, filePaths: string[], fileContents: string) {
  const fileBuffer = Buffer.from(fileContents);
  console.log('temp dir: ', dirPath);
  filePaths.forEach((path) => fs.outputFileSync(resolve(dirPath, path), fileBuffer));
}

describe('exportFunctions() function exporter test suite', () => {
  const testFiles = [
    'pretend-index.ts',
    'sample.func.ts',
    'camel-case-func.func.ts',
    './empty-folder/',
    'folder/new.func.ts',
    'folder/not-a-func.ts',
  ];
  const { name: tempFuncDir, removeCallback } = tmp.dirSync();
  const randOutput = Math.floor(Math.random() * 10);
  const filePathToPropertyPath = (moduleFilePath: string) => {
    const funcName = bff.funcNameFromRelPathDefault(moduleFilePath);
    return funcName.replace('-', '.');
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  beforeAll(() => {
    generateTestDir(tempFuncDir, testFiles, `export default ${randOutput};`);
  });

  afterAll(() => {
    rimfar.sync(tempFuncDir);
    tmp.setGracefulCleanup();
    removeCallback();
  });

  const exportTestFactory = (configObj?: any) =>
    // eslint-disable-next-line implicit-arrow-linebreak
    bff.exportFunctions({
      __dirname: tempFuncDir,
      __filename: `${tempFuncDir}/pretend-index.ts`,
      exports: {},
      searchGlob: '**/*.func.ts',
      ...configObj,
    });

  it('should not export itself', () => {
    expect(exportTestFactory()).not.toHaveProperty(filePathToPropertyPath(testFiles[0]));
  });

  it('should export from the default export of each submodule', () => {
    expect(exportTestFactory()).toHaveProperty(filePathToPropertyPath(testFiles[1]), randOutput);
  });

  it('should properly nest submodules found in directories', () => {
    expect(exportTestFactory()).toHaveProperty(filePathToPropertyPath(testFiles[4]), randOutput);
  });

  it('should correctly apply camelCase to kebab-case named files', () => {
    expect(exportTestFactory()).toHaveProperty(filePathToPropertyPath(testFiles[2]), randOutput);
  });

  it('should correctly identify files not to export due to the glob match', () => {
    expect(exportTestFactory()).not.toHaveProperty(filePathToPropertyPath(testFiles[5]));
  });

  it('should run custom function name generator if provided', () => {
    const funcGenSpy = jest.fn(bff.funcNameFromRelPathDefault);
    exportTestFactory({ funcNameFromRelPath: funcGenSpy });
    // eslint-disable-next-line jest/prefer-called-with
    expect(funcGenSpy).toHaveBeenCalled();
  });

  it('should work without __dirname parameter', () => {
    const testObj = exportTestFactory({
      __dirname: undefined,
      enableLogger: true,
    });
    expect(testObj).toHaveProperty(filePathToPropertyPath(testFiles[1]), randOutput);
  });

  it('should only extract one module when FUNCTION_NAME present', () => {
    process.env.FUNCTION_NAME = bff.funcNameFromRelPathDefault(testFiles[1]);
    const result = exportTestFactory({ enableLogger: true });
    expect(result).not.toHaveProperty(filePathToPropertyPath(testFiles[2]));
    expect(result).toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(Object.keys(result)).toHaveLength(1);
  });
});
