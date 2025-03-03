
import { expect } from 'chai';
import { messages } from '../../lib/messages';

suite('messages Test Suite', () => {
    suite('#isSource()', () => {
        test('isSource should return true if the source ends with " via Code Analyzer"', () => {
            // ===== SETUP =====
            const source = 'Generated via Code Analyzer';

            // ===== TEST =====
            const result = messages.diagnostics.source.isSource(source);

            // ===== ASSERTIONS =====
            expect(result).to.equal(true);
        });

        test('isSource should return false if the source does not end with " via Code Analyzer"', () => {
            // ===== SETUP =====
            const source = 'Generated by Some Other Tool';

            // ===== TEST =====
            const result = messages.diagnostics.source.isSource(source);

            // ===== ASSERTIONS =====
            expect(result).to.equal(false);
        });

        test('isSource should return false if the source is undefined', () => {
            // ===== SETUP =====
            const source: string = undefined;

            // ===== TEST =====
            const result = messages.diagnostics.source.isSource(source);

            // ===== ASSERTIONS =====
            expect(result).to.equal(false);
        });
    });
    suite('#extractEngine()', () => {
        test('extractEngine should return the first word of the source string', () => {
            // ===== SETUP =====
            const source = 'ESLint via Code Analyzer';
    
            // ===== TEST =====
            const result = messages.diagnostics.source.extractEngine(source);
    
            // ===== ASSERTIONS =====
            expect(result).to.equal('ESLint');
        });
    
        test('extractEngine should return undefined if the source is undefined', () => {
            // ===== SETUP =====
            const source: string = undefined;
    
            // ===== TEST =====
            const result = messages.diagnostics.source.extractEngine(source);
    
            // ===== ASSERTIONS =====
            expect(result).to.equal(undefined);
        });
    
        test('extractEngine should return an empty string if the source is an empty string', () => {
            // ===== SETUP =====
            const source = '';
    
            // ===== TEST =====
            const result = messages.diagnostics.source.extractEngine(source);
    
            // ===== ASSERTIONS =====
            expect(result).to.equal('');
        });
    
        test('extractEngine should return the full string if there is no space', () => {
            // ===== SETUP =====
            const source = 'oneword';
    
            // ===== TEST =====
            const result = messages.diagnostics.source.extractEngine(source);
    
            // ===== ASSERTIONS =====
            expect(result).to.equal('oneword');
        });
    });
});