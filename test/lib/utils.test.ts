import * as vscode from 'vscode';
import {isValidFileForAnalysis} from '../../src/lib/utils';

describe('Tests for utils.ts', () => {
    describe('isValidFileForAnalysis', () => {
        it('should return true when file extension matches allowed types', () => {
            const allowedTypes = new Set(['.cls', '.js', '.apex']);
            const uri = vscode.Uri.file('/path/to/MyClass.cls');
            
            expect(isValidFileForAnalysis(uri, allowedTypes)).toBe(true);
        });

        it('should return false when file extension does not match allowed types', () => {
            const allowedTypes = new Set(['.cls', '.js', '.apex']);
            const uri = vscode.Uri.file('/path/to/file.py');
            
            expect(isValidFileForAnalysis(uri, allowedTypes)).toBe(false);
        });

        it('should be case-insensitive when matching extensions', () => {
            const allowedTypes = new Set(['.cls']);
            
            expect(isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.cls'), allowedTypes)).toBe(true);
            expect(isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.CLS'), allowedTypes)).toBe(true);
            expect(isValidFileForAnalysis(vscode.Uri.file('/path/to/MyClass.Cls'), allowedTypes)).toBe(true);
        });

        it('should return false for files with no extension', () => {
            const allowedTypes = new Set(['.cls', '.js']);
            const uri = vscode.Uri.file('/path/to/README');
            
            expect(isValidFileForAnalysis(uri, allowedTypes)).toBe(false);
        });
    });
});

