import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {CodeGenieUnifiedDiffService, UnifiedDiff, DiffType} from "../../../shared/UnifiedDiff";
import {createTextDocument} from "jest-mock-vscode";
import * as stubs from "../stubs";
import {UnifiedDiffService, UnifiedDiffServiceImpl} from "../../../lib/unified-diff-service";
import {messages} from "../../../lib/messages";

describe('Tests for the UnifiedDiffServiceImpl class', () => {
    const sampleUri: vscode.Uri = vscode.Uri.file('/some/file.cls');
    const sampleDocument: vscode.TextDocument = createTextDocument(sampleUri, 'some\nsample content', 'apex');

    let settingsManager: stubs.StubSettingsManager;
    let display: stubs.SpyDisplay;
    let unifiedDiffService: UnifiedDiffService;

    beforeEach(() => {
        settingsManager = new stubs.StubSettingsManager();
        display = new stubs.SpyDisplay();
        unifiedDiffService = new UnifiedDiffServiceImpl(settingsManager, display);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('When register method is called, it calls through to CodeGenieUnifiedDiffService.register', () => {
        const registerSpy = jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'register').mockImplementation((): void => {});

        unifiedDiffService.register();

        expect(registerSpy).toHaveBeenCalled();
    });

    it('When dispose method is called, it calls through to CodeGenieUnifiedDiffService.dispose', () => {
        const disposeSpy = jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'dispose').mockImplementation((): void => {});

        unifiedDiffService.dispose();

        expect(disposeSpy).toHaveBeenCalled();
    });

    describe('Tests for the verifyCanShowDiff method ', () => {
        it('When CodeGenieUnifiedDiffService has a diff for a given document, then verifyCanShowDiff will focus on the diff, display a warning msg box, and return false', () => {
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'hasDiff').mockImplementation((): boolean => {
                return true;
            });
            const focusOnDiffSpy = jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'focusOnDiff').mockImplementation((_diff: UnifiedDiff): Promise<void> => {
                return Promise.resolve();
            });
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'getDiff').mockImplementation((document: vscode.TextDocument): UnifiedDiff => {
                return new UnifiedDiff(document, 'someNewCode');
            });

            const result: boolean = unifiedDiffService.verifyCanShowDiff(sampleDocument);

            expect(focusOnDiffSpy).toHaveBeenCalled();
            expect(display.displayWarningCallHistory).toHaveLength(1);
            expect(display.displayWarningCallHistory[0].msg).toEqual(messages.unifiedDiff.mustAcceptOrRejectDiffFirst);
            expect(result).toEqual(false);
        });

        it('When editor.codeLens setting is not enabled, then verifyCanShowDiff will display a warning msg box and return false', () => {
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'hasDiff').mockImplementation((): boolean => {
                return false;
            });
            settingsManager.getEditorCodeLensEnabledReturnValue = false;

            const result: boolean = unifiedDiffService.verifyCanShowDiff(sampleDocument);

            expect(display.displayWarningCallHistory).toHaveLength(1);
            expect(display.displayWarningCallHistory[0].msg).toEqual(messages.unifiedDiff.editorCodeLensMustBeEnabled);
            expect(result).toEqual(false);
        });

        it('When CodeGenieUnifiedDiffService does not have diff and editor.codeLens setting is enabled, then verifyCanShowDiff returns true', () => {
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'hasDiff').mockImplementation((): boolean => {
                return false;
            });
            settingsManager.getEditorCodeLensEnabledReturnValue = true;

            const result: boolean = unifiedDiffService.verifyCanShowDiff(sampleDocument);

            expect(display.displayWarningCallHistory).toHaveLength(0);
            expect(result).toEqual(true);
        });
    });

    describe('Tests for the showDiff method', () => {
        const dummyAcceptCallback: ()=>Promise<void> = () => {
            return Promise.resolve();
        };
        const dummyRejectCallback: ()=>Promise<void> = () => {
            return Promise.resolve();
        };

        it('When showDiff is called, then CodeGenieUnifiedDiffService.showUnifiedDiff receives the correct diff with callbacks', async () => {
            let diffReceived: UnifiedDiff | undefined;
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'showUnifiedDiff').mockImplementation((diff: UnifiedDiff): Promise<void> => {
                diffReceived = diff;
                return Promise.resolve();
            });

            await unifiedDiffService.showDiff(sampleDocument, 'dummyNewCode', dummyAcceptCallback, dummyRejectCallback);

            expect(diffReceived).toBeDefined();
            expect(diffReceived.getTargetCode()).toEqual('dummyNewCode');
            expect(diffReceived.allowAbilityToAcceptOrRejectIndividualHunks).toEqual(false);
            expect(diffReceived.acceptAllCallback).toEqual(dummyAcceptCallback);
            expect(diffReceived.rejectAllCallback).toEqual(dummyRejectCallback);
        });

        it('When showDiff is called but CodeGenieUnifiedDiffService.showUnifiedDiff errors, then we revert the unified diff and rethrow the error', async () => {
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'showUnifiedDiff').mockImplementation((_diff: UnifiedDiff): Promise<void> => {
                throw new Error('some error from showUnifiedDiff');
            });
            const revertUnifiedDiffSpy = jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'revertUnifiedDiff').mockImplementation((_document: vscode.TextDocument): Promise<void> => {
                return Promise.resolve();
            });

            await expect(unifiedDiffService.showDiff(sampleDocument, 'dummyNewCode', dummyAcceptCallback, dummyRejectCallback))
                .rejects.toThrow('some error from showUnifiedDiff');

            expect(revertUnifiedDiffSpy).toHaveBeenCalled();
        });
    });

    describe('Tests for the getNumberOfDiffedLines method', () => {
        it('When there is no diff, returns 0', () => {
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'getDiff').mockImplementation((): undefined => {
                return undefined;
            });

            const result = unifiedDiffService.getNumberOfDiffedLines(sampleDocument);

            expect(result).toEqual(0);
        });

        it('When there is a diff with only unmodified lines, returns 0', () => {
            const mockDiff = new UnifiedDiff(sampleDocument, 'some\nsample content');
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'getDiff').mockImplementation((): UnifiedDiff => {
                return mockDiff;
            });

            const result = unifiedDiffService.getNumberOfDiffedLines(sampleDocument);

            expect(result).toEqual(0);
        });

        it('When there is a replacement (delete followed by insert), returns the max of their lengths', () => {
            const mockDiff = new UnifiedDiff(sampleDocument, 'some\nnew content');
            jest.spyOn(mockDiff, 'getHunks').mockImplementation(() => [
                { type: DiffType.Unmodified, diff: { value: 'some\n' }, sourceLine: 0, targetLine: 0, unifiedLine: 0, lines: ['some'] },
                { type: DiffType.Delete, diff: { value: 'sample\n' }, sourceLine: 1, targetLine: 1, unifiedLine: 1, lines: ['sample'] },
                { type: DiffType.Insert, diff: { value: 'new content\n' }, sourceLine: 1, targetLine: 1, unifiedLine: 1, lines: ['new content'] }
            ]);
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'getDiff').mockImplementation((): UnifiedDiff => {
                return mockDiff;
            });

            const result = unifiedDiffService.getNumberOfDiffedLines(sampleDocument);

            // max(1, 1) = 1
            expect(result).toEqual(1);
        });

        it('When there is a replacement with different lengths, returns the max of their lengths', () => {
            const mockDiff = new UnifiedDiff(sampleDocument, 'some\nnew\ncontent');
            jest.spyOn(mockDiff, 'getHunks').mockImplementation(() => [
                { type: DiffType.Unmodified, diff: { value: 'some\n' }, sourceLine: 0, targetLine: 0, unifiedLine: 0, lines: ['some'] },
                { type: DiffType.Delete, diff: { value: 'sample\nold\n' }, sourceLine: 1, targetLine: 1, unifiedLine: 1, lines: ['sample', 'old'] },
                { type: DiffType.Insert, diff: { value: 'new\ncontent\n' }, sourceLine: 1, targetLine: 1, unifiedLine: 1, lines: ['new', 'content'] }
            ]);
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'getDiff').mockImplementation((): UnifiedDiff => {
                return mockDiff;
            });

            const result = unifiedDiffService.getNumberOfDiffedLines(sampleDocument);

            // max(2, 2) = 2
            expect(result).toEqual(2);
        });

        it('When there are single insert and delete hunks not adjacent, counts both', () => {
            const mockDiff = new UnifiedDiff(sampleDocument, 'some\nnew\ncontent\nhere');
            jest.spyOn(mockDiff, 'getHunks').mockImplementation(() => [
                { type: DiffType.Unmodified, diff: { value: 'some\n' }, sourceLine: 0, targetLine: 0, unifiedLine: 0, lines: ['some'] },
                { type: DiffType.Delete, diff: { value: 'sample\n' }, sourceLine: 1, targetLine: 1, unifiedLine: 1, lines: ['sample'] },
                { type: DiffType.Unmodified, diff: { value: 'foo\n' }, sourceLine: 2, targetLine: 1, unifiedLine: 2, lines: ['foo'] },
                { type: DiffType.Insert, diff: { value: 'here\n' }, sourceLine: 2, targetLine: 2, unifiedLine: 3, lines: ['here'] }
            ]);
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'getDiff').mockImplementation((): UnifiedDiff => {
                return mockDiff;
            });

            const result = unifiedDiffService.getNumberOfDiffedLines(sampleDocument);

            // 1 delete + 1 insert = 2
            expect(result).toEqual(2);
        });

        it('When there are multiple replacements and single changes, sums appropriately', () => {
            const mockDiff = new UnifiedDiff(sampleDocument, 'some\nnew\ncontent\nhere');
            jest.spyOn(mockDiff, 'getHunks').mockImplementation(() => [
                { type: DiffType.Delete, diff: { value: 'a\nb\n' }, sourceLine: 0, targetLine: 0, unifiedLine: 0, lines: ['a', 'b'] },
                { type: DiffType.Insert, diff: { value: 'x\n' }, sourceLine: 0, targetLine: 0, unifiedLine: 0, lines: ['x'] },
                { type: DiffType.Unmodified, diff: { value: 'foo\n' }, sourceLine: 2, targetLine: 1, unifiedLine: 2, lines: ['foo'] },
                { type: DiffType.Delete, diff: { value: 'c\n' }, sourceLine: 3, targetLine: 2, unifiedLine: 3, lines: ['c'] },
                { type: DiffType.Insert, diff: { value: 'y\nz\n' }, sourceLine: 3, targetLine: 2, unifiedLine: 3, lines: ['y', 'z'] },
                { type: DiffType.Insert, diff: { value: 'here\n' }, sourceLine: 3, targetLine: 4, unifiedLine: 5, lines: ['here'] }
            ]);
            jest.spyOn(CodeGenieUnifiedDiffService.prototype, 'getDiff').mockImplementation((): UnifiedDiff => {
                return mockDiff;
            });

            const result = unifiedDiffService.getNumberOfDiffedLines(sampleDocument);

            // (max(2,1) for first replacement) + (max(1,2) for second replacement) + 1 (single insert) = 2+2+1=5
            expect(result).toEqual(5);
        });
    });
});
