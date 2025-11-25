import * as vscode from 'vscode';
import {_isValidFileForAnalysis} from '../../src/extension';
import {SettingsManager} from '../../src/lib/settings';

describe('Tests for extension.ts exported functions', () => {
    describe('_isValidFileForAnalysis', () => {
        let mockSettingsManager: SettingsManager;

        beforeEach(() => {
            mockSettingsManager = {
                getFileExtensions: jest.fn(),
                getAnalyzeOnOpen: jest.fn(),
                getAnalyzeOnSave: jest.fn(),
                getCodeAnalyzerConfigFile: jest.fn(),
                getCodeAnalyzerRuleSelectors: jest.fn(),
                getEditorCodeLensEnabled: jest.fn()
            };
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        describe('with custom configured extensions', () => {
            it('should validate configured extensions (positive cases)', () => {
                const configuredExtensions = new Set(['.cls', '.js', '.apex', '.html']);
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(configuredExtensions);
                
                // All these should return true
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.cls'), mockSettingsManager)).toBe(true);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/script.js'), mockSettingsManager)).toBe(true);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/file.apex'), mockSettingsManager)).toBe(true);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/page.html'), mockSettingsManager)).toBe(true);
            });

            it('should reject non-configured extensions', () => {
                const configuredExtensions = new Set(['.cls', '.js']);
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(configuredExtensions);
                
                // These should return false
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/page.html'), mockSettingsManager)).toBe(false);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/README'), mockSettingsManager)).toBe(false);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/script.py'), mockSettingsManager)).toBe(false);
            });
        });

        describe('with default extensions (empty configuration)', () => {
            const defaultExtensions = ['.cls', '.js', '.apex', '.trigger', '.ts', '.xml', '.css', '.html', '.cmp'];
            
            it('should use default extensions when configuration is empty', () => {
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(new Set());
                
                // Test all default extensions
                defaultExtensions.forEach(ext => {
                    const uri = vscode.Uri.file(`/path/to/file${ext}`);
                    expect(_isValidFileForAnalysis(uri, mockSettingsManager)).toBe(true);
                });
            });

            it('should reject non-default extensions when configuration is empty', () => {
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(new Set());
                
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/script.py'), mockSettingsManager)).toBe(false);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/Main.java'), mockSettingsManager)).toBe(false);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/doc.md'), mockSettingsManager)).toBe(false);
            });
        });

        describe('case-insensitivity', () => {
            it('should match extensions case-insensitively', () => {
                const configuredExtensions = new Set(['.cls']);
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(configuredExtensions);
                
                // All case variations should match
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.cls'), mockSettingsManager)).toBe(true);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.CLS'), mockSettingsManager)).toBe(true);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.Cls'), mockSettingsManager)).toBe(true);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.cLs'), mockSettingsManager)).toBe(true);
            });
        });

        describe('edge cases', () => {
            it('should handle large Set of extensions efficiently (performance test)', () => {
                // Create a Set with 100+ extensions to verify O(1) lookup performance
                const largeExtensionSet = new Set(Array.from({ length: 100 }, (_, i) => `.ext${i}`));
                largeExtensionSet.add('.cls');
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(largeExtensionSet);
                
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.cls'), mockSettingsManager)).toBe(true);
            });

            it('should handle files with multiple dots in filename', () => {
                const configuredExtensions = new Set(['.cls']);
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(configuredExtensions);
                
                // Should match on last extension only
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/my.component.cls'), mockSettingsManager)).toBe(true);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/file.test.js'), mockSettingsManager)).toBe(false);
            });

            it('should handle paths with special characters', () => {
                const configuredExtensions = new Set(['.cls']);
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(configuredExtensions);
                
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/to/my-component_v2 (1).cls'), mockSettingsManager)).toBe(true);
                expect(_isValidFileForAnalysis(vscode.Uri.file('/path/with spaces/file.cls'), mockSettingsManager)).toBe(true);
            });

            it('should handle deeply nested paths', () => {
                const configuredExtensions = new Set(['.cls']);
                (mockSettingsManager.getFileExtensions as jest.Mock).mockReturnValue(configuredExtensions);
                
                expect(_isValidFileForAnalysis(vscode.Uri.file('/very/deep/nested/path/to/some/folder/MyClass.cls'), mockSettingsManager)).toBe(true);
            });
        });
    });
});
