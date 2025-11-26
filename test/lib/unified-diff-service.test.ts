import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {CodeGenieUnifiedDiffService, UnifiedDiff} from "../../src/shared/UnifiedDiff";
import {createTextDocument} from "jest-mock-vscode";
import * as stubs from "../stubs";
import {UnifiedDiffService, UnifiedDiffServiceImpl} from "../../src/lib/unified-diff-service";
import {messages} from "../../src/lib/messages";

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
});
