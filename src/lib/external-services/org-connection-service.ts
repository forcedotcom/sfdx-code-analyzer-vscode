import * as vscode from "vscode";

export interface OrgConnectionService {
    isAuthed(): boolean;
    getApiVersion(): Promise<string>;
    onOrgChange(callback: (orgUserInfo: OrgUserInfo) => void): void;
    request<T>(requestOptions: HttpRequest): Promise<T>;
}

export interface OrgConnectionServiceProvider {
    isOrgConnectionServiceAvailable(): Promise<boolean>
    getOrgConnectionService(): Promise<OrgConnectionService>
}

export class NoOpOrgConnectionService implements OrgConnectionService {
    isAuthed(): boolean {
        return false;
    }

    getApiVersion(): Promise<string> {
        throw new Error(`Cannot get the api verison because no org is authed.`);
    }

    onOrgChange(_callback: (orgUserInfo: OrgUserInfo) => void): void {
        // No-op
    }

    request<T>(requestOptions: HttpRequest): Promise<T> {
        throw new Error(`Cannot make the following request because no org is authed:\n${JSON.stringify(requestOptions, null, 2)}`);
    }
}

export class LiveOrgConnectionService implements OrgConnectionService {
    private readonly workpaceContext: WorkspaceContext;

    constructor(workspaceContext: WorkspaceContext) {
        this.workpaceContext = workspaceContext;
    }

    isAuthed(): boolean {
        return this.workpaceContext.orgId?.length > 0;
    }

    async getApiVersion(): Promise<string> {
        if (!this.isAuthed()) {
            throw new Error(`Cannot get the api verison because no org is authed.`);
        }
        const connection: Connection = await this.workpaceContext.getConnection();
        return connection.getApiVersion();
    }


    onOrgChange(callback: (orgUserInfo: OrgUserInfo) => void): void {
        this.workpaceContext.onOrgChange(callback);
    }

    async request<T>(requestOptions: HttpRequest): Promise<T> {
        if (!this.isAuthed()) {
            throw new Error(`Cannot make the following request because no org is authed:\n${JSON.stringify(requestOptions, null, 2)}`);
        }
        const connection: Connection = await this.workpaceContext.getConnection();
        return await connection.request(requestOptions);
    }
}

// See https://github.com/forcedotcom/salesforcedx-vscode/blob/develop/packages/salesforcedx-utils-vscode/src/context/workspaceContextUtil.ts#L15
export type OrgUserInfo = {
    username?: string;
    alias?: string;
}

// See https://github.com/jsforce/jsforce/blob/main/src/types/common.ts#L32
export type HttpRequest = {
    url: string;
    method: HttpMethods;
    body?: string;
    headers?: Record<string, string>
}
export type HttpMethods = 
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD';

// See https://github.com/forcedotcom/salesforcedx-vscode/blob/develop/packages/salesforcedx-vscode-core/src/context/workspaceContext.ts#L23
export interface WorkspaceContext {
    readonly onOrgChange: vscode.Event<OrgUserInfo>;
    getConnection(): Promise<Connection>;
    get username(): string | undefined;
    get alias(): string | undefined;
    get orgId(): string | undefined;
}


// See https://github.com/forcedotcom/sfdx-core/blob/main/src/org/connection.ts#L71
export interface Connection {
    getApiVersion(): string;
    request<T>(requestOptions: HttpRequest): Promise<T>;
}
