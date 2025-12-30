import {Workspace} from '../../src/lib/workspace';
import {FileHandler} from '../../src/lib/fs-utils';
import {VscodeWorkspace} from '../../src/lib/vscode-api';
import {StubFileHandler, StubVscodeWorkspace} from '../stubs';
import * as vscode from 'vscode';
import {glob} from 'glob';

jest.mock('glob');

describe('Tests for Workspace class', () => {
    let fileHandler: FileHandler;
    let vscodeWorkspace: VscodeWorkspace;
    let mockGlob: jest.MockedFunction<typeof glob>;

    beforeEach(() => {
        fileHandler = new StubFileHandler();
        vscodeWorkspace = new StubVscodeWorkspace();
        mockGlob = glob as jest.MockedFunction<typeof glob>;
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('fromTargetPaths', () => {
        it('should create a Workspace instance with valid target paths', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;

            const targetPaths = ['/path/to/file1.cls', '/path/to/file2.js'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            expect(workspace).toBeInstanceOf(Workspace);
            expect(workspace.getRawTargetPaths()).toEqual(targetPaths);
        });

        it('should deduplicate duplicate target paths', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;

            const targetPaths = ['/path/to/file1.cls', '/path/to/file1.cls', '/path/to/file2.js'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            expect(workspace.getRawTargetPaths()).toEqual(['/path/to/file1.cls', '/path/to/file2.js']);
        });

        it('should throw error when a target path does not exist', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = false;

            const targetPaths = ['/path/to/nonexistent.cls'];
            
            await expect(
                Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler)
            ).rejects.toThrow('Selected file doesn\'t exist: /path/to/nonexistent.cls');
        });

        it('should throw error when any target path in array does not exist', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.exists = jest.fn().mockImplementation((path: string) => {
                return Promise.resolve(path !== '/path/to/nonexistent.cls');
            });

            const targetPaths = ['/path/to/existent.cls', '/path/to/nonexistent.cls'];
            
            await expect(
                Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler)
            ).rejects.toThrow('Selected file doesn\'t exist: /path/to/nonexistent.cls');
        });

        it('should handle empty target paths array', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;

            const targetPaths: string[] = [];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            expect(workspace).toBeInstanceOf(Workspace);
            expect(workspace.getRawTargetPaths()).toEqual([]);
        });
    });

    describe('getRawTargetPaths', () => {
        it('should return the raw target paths', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;

            const targetPaths = ['/path/to/file1.cls', '/path/to/file2.js'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            expect(workspace.getRawTargetPaths()).toEqual(targetPaths);
        });

        it('should return empty array when no target paths provided', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;

            const workspace = await Workspace.fromTargetPaths([], vscodeWorkspace, fileHandler);

            expect(workspace.getRawTargetPaths()).toEqual([]);
        });
    });

    describe('getRawWorkspacePaths', () => {
        it('should return workspace folders and target paths combined', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            const stubVscodeWorkspace = vscodeWorkspace as StubVscodeWorkspace;
            stubVscodeWorkspace.getWorkspaceFoldersReturnValue = ['/workspace/folder1', '/workspace/folder2'];

            const targetPaths = ['/path/to/file1.cls'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const workspacePaths = workspace.getRawWorkspacePaths();
            expect(workspacePaths).toContain('/workspace/folder1');
            expect(workspacePaths).toContain('/workspace/folder2');
            expect(workspacePaths).toContain('/path/to/file1.cls');
            expect(workspacePaths.length).toBe(3);
        });

        it('should deduplicate paths when workspace folders and target paths overlap', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            const stubVscodeWorkspace = vscodeWorkspace as StubVscodeWorkspace;
            stubVscodeWorkspace.getWorkspaceFoldersReturnValue = ['/workspace/folder1'];

            const targetPaths = ['/workspace/folder1'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const workspacePaths = workspace.getRawWorkspacePaths();
            expect(workspacePaths).toEqual(['/workspace/folder1']);
        });

        it('should return only target paths when no workspace folders exist', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            const stubVscodeWorkspace = vscodeWorkspace as StubVscodeWorkspace;
            stubVscodeWorkspace.getWorkspaceFoldersReturnValue = [];

            const targetPaths = ['/path/to/file1.cls', '/path/to/file2.js'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            expect(workspace.getRawWorkspacePaths()).toEqual(targetPaths);
        });

        it('should return only workspace folders when no target paths provided', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            const stubVscodeWorkspace = vscodeWorkspace as StubVscodeWorkspace;
            stubVscodeWorkspace.getWorkspaceFoldersReturnValue = ['/workspace/folder1'];

            const workspace = await Workspace.fromTargetPaths([], vscodeWorkspace, fileHandler);

            expect(workspace.getRawWorkspacePaths()).toEqual(['/workspace/folder1']);
        });

        it('should return empty array when no workspace folders and no target paths', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            const stubVscodeWorkspace = vscodeWorkspace as StubVscodeWorkspace;
            stubVscodeWorkspace.getWorkspaceFoldersReturnValue = [];

            const workspace = await Workspace.fromTargetPaths([], vscodeWorkspace, fileHandler);

            expect(workspace.getRawWorkspacePaths()).toEqual([]);
        });
    });

    describe('getTargetedFiles', () => {
        it('should return file paths when targets are files', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            stubFileHandler.isDirReturnValue = false;

            const targetPaths = ['/path/to/file1.cls', '/path/to/file2.js'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const files = await workspace.getTargetedFiles();
            expect(files).toEqual(targetPaths);
        });

        it('should expand folders recursively into files', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            stubFileHandler.isDir = jest.fn().mockImplementation((path: string) => {
                return Promise.resolve(path === '/path/to/folder');
            });

            mockGlob.mockResolvedValue(['/path/to/folder/file1.cls', '/path/to/folder/file2.js']);

            // Mock vscode.Uri.file to return the same path
            jest.spyOn(vscode.Uri, 'file').mockImplementation((path: string) => {
                return {
                    fsPath: path
                } as vscode.Uri;
            });

            const targetPaths = ['/path/to/folder'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const files = await workspace.getTargetedFiles();
            expect(files).toEqual(['/path/to/folder/file1.cls', '/path/to/folder/file2.js']);
            expect(mockGlob).toHaveBeenCalledWith('/path/to/folder/**/*', {nodir: true});
        });

        it('should handle mixed files and folders', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            stubFileHandler.isDir = jest.fn().mockImplementation((path: string) => {
                return Promise.resolve(path === '/path/to/folder');
            });

            mockGlob.mockResolvedValue(['/path/to/folder/file1.cls', '/path/to/folder/file2.js']);

            jest.spyOn(vscode.Uri, 'file').mockImplementation((path: string) => {
                return {
                    fsPath: path
                } as vscode.Uri;
            });

            const targetPaths = ['/path/to/file.cls', '/path/to/folder'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const files = await workspace.getTargetedFiles();
            expect(files).toContain('/path/to/file.cls');
            expect(files).toContain('/path/to/folder/file1.cls');
            expect(files).toContain('/path/to/folder/file2.js');
        });

        it('should convert Windows backslashes to forward slashes for glob', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            stubFileHandler.isDir = jest.fn().mockImplementation((path: string) => {
                return Promise.resolve(path === 'C:\\path\\to\\folder');
            });

            mockGlob.mockResolvedValue(['C:/path/to/folder/file1.cls']);

            jest.spyOn(vscode.Uri, 'file').mockImplementation((path: string) => {
                return {
                    fsPath: path
                } as vscode.Uri;
            });

            const targetPaths = ['C:\\path\\to\\folder'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const files = await workspace.getTargetedFiles();
            expect(files).toEqual(['C:/path/to/folder/file1.cls']);
            expect(mockGlob).toHaveBeenCalledWith('C:/path/to/folder/**/*', {nodir: true});
        });

        it('should handle multiple folders', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            stubFileHandler.isDir = jest.fn().mockImplementation((path: string) => {
                return Promise.resolve(path.startsWith('/path/to/'));
            });

            mockGlob
                .mockResolvedValueOnce(['/path/to/folder1/file1.cls'])
                .mockResolvedValueOnce(['/path/to/folder2/file2.js']);

            jest.spyOn(vscode.Uri, 'file').mockImplementation((path: string) => {
                return {
                    fsPath: path
                } as vscode.Uri;
            });

            const targetPaths = ['/path/to/folder1', '/path/to/folder2'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const files = await workspace.getTargetedFiles();
            expect(files.length).toBe(2);
            expect(files).toContain('/path/to/folder1/file1.cls');
            expect(files).toContain('/path/to/folder2/file2.js');
        });

        it('should return empty array when no target paths provided', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;

            const workspace = await Workspace.fromTargetPaths([], vscodeWorkspace, fileHandler);

            const files = await workspace.getTargetedFiles();
            expect(files).toEqual([]);
        });

        it('should handle glob returning empty array for empty folder', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            stubFileHandler.isDir = jest.fn().mockImplementation((path: string) => {
                return Promise.resolve(path === '/path/to/empty-folder');
            });

            mockGlob.mockResolvedValue([]);

            jest.spyOn(vscode.Uri, 'file').mockImplementation((path: string) => {
                return {
                    fsPath: path
                } as vscode.Uri;
            });

            const targetPaths = ['/path/to/empty-folder'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const files = await workspace.getTargetedFiles();
            expect(files).toEqual([]);
        });

        it('should preserve file order when mixing files and folders', async () => {
            const stubFileHandler = fileHandler as StubFileHandler;
            stubFileHandler.existsReturnValue = true;
            stubFileHandler.isDir = jest.fn().mockImplementation((path: string) => {
                return Promise.resolve(path === '/path/to/folder');
            });

            mockGlob.mockResolvedValue(['/path/to/folder/file1.cls']);

            jest.spyOn(vscode.Uri, 'file').mockImplementation((path: string) => {
                return {
                    fsPath: path
                } as vscode.Uri;
            });

            const targetPaths = ['/path/to/file1.cls', '/path/to/folder', '/path/to/file2.js'];
            const workspace = await Workspace.fromTargetPaths(targetPaths, vscodeWorkspace, fileHandler);

            const files = await workspace.getTargetedFiles();
            expect(files[0]).toBe('/path/to/file1.cls');
            expect(files[files.length - 1]).toBe('/path/to/file2.js');
            expect(files).toContain('/path/to/folder/file1.cls');
        });
    });
});

