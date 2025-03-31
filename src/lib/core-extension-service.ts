/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import * as semver from 'semver';
import {SettingsManagerImpl} from './settings';

import { CORE_EXTENSION_ID, MINIMUM_REQUIRED_VERSION_CORE_EXTENSION } from './constants';
/**
 * Manages access to the services exported by the Salesforce VSCode Extension Pack's core extension.
 * If the extension pack isn't installed, only performs no-ops.
 */
export class CoreExtensionService {
    private static initialized = false;
    private static workspaceContext: WorkspaceContext;

    public static async loadDependencies(outputChannel: vscode.LogOutputChannel): Promise<void> {
        if (!CoreExtensionService.initialized) {
            const coreExtensionApi = await this.getCoreExtensionApiOrUndefined();

            // TODO: For testability, this should probably be passed in, instead of instantiated.
            if (new SettingsManagerImpl().getApexGuruEnabled()) {
                CoreExtensionService.initializeWorkspaceContext(coreExtensionApi?.services.WorkspaceContext, outputChannel);
            }
            CoreExtensionService.initialized = true;
        }
    }

    private static async getCoreExtensionApiOrUndefined(): Promise<CoreExtensionApi|undefined> {
        // Note that when we get an extension, then it's "exports" field is the provided the return value
        // of the extensions activate method. If the activate method hasn't been called, then this won't be filled in.
        // Also note that the type of the return of the activate method is the templated type T of the Extension<T>.

        const coreExtension: vscode.Extension<CoreExtensionApi> = vscode.extensions.getExtension(CORE_EXTENSION_ID);
        if (!coreExtension) {
            console.log(`${CORE_EXTENSION_ID} not found; cannot load core dependencies. Returning undefined instead.`);
            return undefined;
        }

        const pkgJson: {version: string} = coreExtension.packageJSON as {version: string};

        // We know that there has to be a `version` property on the package.json object.
        const coreExtensionVersion = pkgJson.version;
        if (semver.lt(coreExtensionVersion, MINIMUM_REQUIRED_VERSION_CORE_EXTENSION)) {
            console.log(`${CORE_EXTENSION_ID} below minimum viable version; cannot load core dependencies. Returning undefined instead.`);
            return undefined;
        }

        if (!coreExtension.isActive) {
            console.log(`${CORE_EXTENSION_ID} present but inactive. Activating now.`);
            await coreExtension.activate(); // will call the extensions activate function and fill in the exports property with its return value
        }

        console.log(`${CORE_EXTENSION_ID} present and active. Returning its exported API.`);
        return coreExtension.exports;
    }

    private static initializeWorkspaceContext(workspaceContext: WorkspaceContext | undefined, outputChannel: vscode.LogOutputChannel) {
        if (!workspaceContext) {
            outputChannel.warn('***Workspace Context not present in core dependency API. Check if the Core Extension installed.***');
            outputChannel.show();
        }
        CoreExtensionService.workspaceContext = workspaceContext.getInstance(false);
    }

    static async getWorkspaceOrgId(): Promise<string | undefined> {
        if (CoreExtensionService.initialized) {
            const connection = await CoreExtensionService.workspaceContext.getConnection();
            return connection.getAuthInfoFields().orgId ?? '';
        }
        throw new Error('***Org not initialized***');
    }

    static async getConnection(): Promise<Connection> {
        const connection = await CoreExtensionService.workspaceContext.getConnection();
        return connection;
    }
}

// See https://github.com/forcedotcom/salesforcedx-vscode/blob/develop/packages/salesforcedx-vscode-core/src/index.ts#L479
interface CoreExtensionApi {
    services: {
        WorkspaceContext: WorkspaceContext;
    }
}




// TODO: Move all this Workspace Context stuff over into the external-services-provider so that we can instead pass in
// the connection into the apex-guru-service code using dependency injection instead of all the global stuff.


// See https://github.com/forcedotcom/salesforcedx-vscode/blob/develop/packages/salesforcedx-vscode-core/src/context/workspaceContext.ts
interface WorkspaceContext {
    // Note that the salesforce.salesforcedx-vscode-core extension's active method doesn't actually return an instance
    // of this service, but instead returns the class. We must use the getInstance static method to create the instance.
    getInstance(forceNew: boolean): WorkspaceContext;

    // We need the connection, but no other instance methods currently
    getConnection(): Promise<Connection>;
}

export type AuthFields = {
    accessToken?: string;
    alias?: string;
    authCode?: string;
    clientId?: string;
    clientSecret?: string;
    created?: string;
    createdOrgInstance?: string;
    devHubUsername?: string;
    instanceUrl?: string;
    instanceApiVersion?: string;
    instanceApiVersionLastRetrieved?: string;
    isDevHub?: boolean;
    loginUrl?: string;
    orgId?: string;
    password?: string;
    privateKey?: string;
    refreshToken?: string;
    scratchAdminUsername?: string;
    snapshot?: string;
    userId?: string;
    username?: string;
    usernames?: string[];
    userProfileName?: string;
    expirationDate?: string;
    tracksSource?: boolean;
};


// See https://github.com/forcedotcom/sfdx-core/blob/main/src/org/connection.ts#L69
export interface Connection {
    getApiVersion(): string;
    getAuthInfoFields(): AuthFields;
    request<T>(options: { method: string; url: string; body: string; headers?: Record<string, string> }): Promise<T>;
}
