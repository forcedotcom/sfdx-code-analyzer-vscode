import * as vscode from "vscode";
import {FileHandler} from "./fs-utils";
import {messages} from "./messages";
import {glob} from "glob";
import {VscodeWorkspace} from "./vscode-api";

// Note, calling this Workspace since the future we might make this close and closer like what we have in Core and
// eventually replace it when we no longer depend on the CLI.
export class Workspace {
    private readonly rawTargets: string[];
    private readonly vscodeWorkspace: VscodeWorkspace;
    private readonly fileHandler: FileHandler;

    private constructor(rawTargets: string[], vscodeWorkspace: VscodeWorkspace, fileHandler: FileHandler) {
        this.rawTargets = rawTargets;
        this.vscodeWorkspace = vscodeWorkspace;
        this.fileHandler = fileHandler;
    }

    static async fromTargetPaths(targetedPaths: string[], vscodeWorkspace: VscodeWorkspace, fileHandler: FileHandler): Promise<Workspace> {
        const uniqueTargetPaths: Set<string> = new Set();
        for (const target of targetedPaths) {
            if (!(await fileHandler.exists(target))) {
                // This should never happen, but we should handle it gracefully regardless.
                throw new Error(messages.targeting.error.nonexistentSelectedFileGenerator(target));
            }
            uniqueTargetPaths.add(target);
        }
        return new Workspace([...uniqueTargetPaths], vscodeWorkspace, fileHandler);
    }

    /**
     * Unique string array of targeted files and folders as they were selected by the user
     */
    getRawTargetPaths(): string[] {
        return this.rawTargets;
    }

    /**
     * Unique array of files and folders that make up the workspace.
     *
     * Just in case a file is open in the editor that does not live in the current workspace, or if there
     * is no workspace open at all, we still want to be able to run code analyzer without error, so we
     * include the raw targeted files and folders always along with any vscode workspace folders.
     */
    getRawWorkspacePaths(): string[] {
        return [... new Set([
            ...this.vscodeWorkspace.getWorkspaceFolders(),
            ...this.getRawTargetPaths()
        ])];
    }

    /**
     * String array of expanded files that make up the targeted files
     * This array is derived by expanding the targeted folders recursively into their children files.
     */
    async getTargetedFiles(): Promise<string[]> {
        const workspaceFiles: string[] = [];
        for (const fileOrFolder of this.getRawTargetPaths()) {
            if (await this.fileHandler.isDir(fileOrFolder)) {
                // Globby wants forward-slashes, but Windows uses back-slashes, so always convert to forward slashes
                const globbablePath: string = fileOrFolder.replace(/\\/g, '/');
                const globOut: string[] = await glob(`${globbablePath}/**/*`, {nodir: true});
                // Globby's results are Unix-formatted. Do a Uri.file round-trip to return the path to its expected form.
                globOut.forEach(o => workspaceFiles.push(vscode.Uri.file(o).fsPath));
            } else {
                workspaceFiles.push(fileOrFolder);
            }
        }
        return workspaceFiles;
    }
}
