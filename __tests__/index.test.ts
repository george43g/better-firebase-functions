import 'jest';
import load from '../src'
// const requireSpy = jest.spyOn(module, 'require');

describe('firebase-functions automatic function module exporter', () => {
    let exportTest = {};
    load(__dirname, __filename, exportTest, '../__mocks__', '**/*.func.ts');
    it('should export from the default export of each submodule', () => {
        expect(exportTest).toHaveProperty('new', 5);
    })
    it('should properly nest submodules found in directories', () => {
        expect(exportTest).toHaveProperty('auth.new', 5)
    })
    it('should correctly apply camelCase to kebab-case named files', () => {
        expect(exportTest).toHaveProperty('camelFunc', 5);
    })
    it('should correctly identify files not to export due to the glob match', () => {
        expect(exportTest).not.toHaveProperty('auth.notAFunc')

    })
})