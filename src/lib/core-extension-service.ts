/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import { Event } from 'vscode';
import { satisfies } from 'semver';
import { messages } from './messages';
import { AuthFields } from '../types';

import { CORE_EXTENSION_ID, MINIMUM_REQUIRED_VERSION_CORE_EXTENSION } from './constants';

/**
 * Manages access to the services exported by the Salesforce VSCode Extension Pack's core extension.
 * If the extension pack isn't installed, only performs no-ops.
 */
export class CoreExtensionService {
	private static initialized = false;
	private static telemetryService: CoreTelemetryService;
	private static workspaceContext: WorkspaceContext;

	public static async loadDependencies(context: vscode.ExtensionContext): Promise<void> {
		if (!CoreExtensionService.initialized) {
			const coreExtensionApi = await this.getCoreExtensionApiOrUndefined();

			await CoreExtensionService.initializeTelemetryService(coreExtensionApi?.services.TelemetryService, context);
			CoreExtensionService.initializeWorkspaceContext(coreExtensionApi?.services.WorkspaceContext);
			CoreExtensionService.initialized = true;
		}
	}

	private static async getCoreExtensionApiOrUndefined(): Promise<CoreExtensionApi|undefined> {
		const coreExtension = vscode.extensions.getExtension(CORE_EXTENSION_ID);
		if (!coreExtension) {
			console.log(`${CORE_EXTENSION_ID} not found; cannot load core dependencies. Returning undefined instead.`);
			return undefined;
		}

		// We know that there has to be a `version` property on the package.json object.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const coreExtensionVersion = (coreExtension.packageJSON.version) as string;
		if (!this.isAboveMinimumRequiredVersion(MINIMUM_REQUIRED_VERSION_CORE_EXTENSION, coreExtensionVersion)) {
			console.log(`${CORE_EXTENSION_ID} below minimum viable version; cannot load core dependencies. Returning undefined instead.`);
			return undefined;
		}

		if (!coreExtension.isActive) {
			console.log(`${CORE_EXTENSION_ID} present but inactive. Activating now.`);
			await coreExtension.activate();
		}

		console.log(`${CORE_EXTENSION_ID} present and active. Returning its exported API.`);
		return coreExtension.exports as CoreExtensionApi;
	}

	/**
	 * Verifies that the current version of a dependency is at least as recent as the minimum required version.
	 * @param minRequiredVersion
	 * @param actualVersion
	 */
	public static isAboveMinimumRequiredVersion(minRequiredVersion: string, actualVersion: string): boolean {
		return satisfies(actualVersion, ">=" + minRequiredVersion);
	}

	/**
	 * Initializes a {@link CoreTelemetryService} instance of the provided class, or uses null if none was provided.
	 * @param telemetryService
	 * @param context
	 */
	private static async initializeTelemetryService(telemetryService: CoreTelemetryService | undefined, context: vscode.ExtensionContext): Promise<void> {
		if (!telemetryService) {
			console.log(`Telemetry service not present in core dependency API. Using null instead.`);
			CoreExtensionService.telemetryService = null;
		} else {
			CoreExtensionService.telemetryService = telemetryService.getInstance();
			await CoreExtensionService.telemetryService.initializeService(context);
		}
	}

	private static initializeWorkspaceContext(workspaceContext: WorkspaceContext | undefined) {
		if (!workspaceContext) {
			throw new Error('***workspace context not found***');
		}
		CoreExtensionService.workspaceContext = workspaceContext.getInstance(false);
	}

	/**
	 *
	 * @returns The {@link TelemetryService} object exported by the Core Extension if available, else null.
	 */
	public static _getTelemetryService(): CoreTelemetryService|null {
		if (CoreExtensionService.initialized) {
			return CoreExtensionService.telemetryService;
		}
		throw new Error(messages.error.coreExtensionServiceUninitialized);
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

export class TelemetryService {

	public static sendExtensionActivationEvent(hrStart: [number, number]): void {
		CoreExtensionService._getTelemetryService()?.sendExtensionActivationEvent(hrStart);
	}

	public static sendCommandEvent(key: string, data: Properties): void {
		CoreExtensionService._getTelemetryService()?.sendCommandEvent(key, undefined, data);
	}

	public static sendException(name: string, message: string, data?: Record<string, string>): void {
		const fullMessage = data ? message + JSON.stringify(data) : message;
		CoreExtensionService._getTelemetryService()?.sendException(name, fullMessage);
	}

	public static dispose(): void {
		CoreExtensionService._getTelemetryService()?.dispose();
	}
}


interface Measurements {
	[key: string]: number;
}

export interface Properties {
	[key: string]: string;
}

/**
 * This interface is a subset of the TelemetryService interface from the salesforcedx-utils-vscode package.
 */
interface CoreTelemetryService {
	extensionName: string;
	isTelemetryEnabled(): boolean;
	getInstance(): CoreTelemetryService;
	initializeService(extensionContext: vscode.ExtensionContext): Promise<void>;
	sendExtensionActivationEvent(hrstart: [number, number]): void;
	sendExtensionDeactivationEvent(): void;
	sendCommandEvent(
		commandName?: string,
		hrstart?: [number, number],
		properties?: Properties,
		measurements?: Measurements
	): void;
	sendException(name: string, message: string): void;
	dispose(): void;
}

interface CoreExtensionApi {
	services: {
		TelemetryService: CoreTelemetryService;
		WorkspaceContext: WorkspaceContext;
	}
}

interface WorkspaceContext {
	readonly onOrgChange: Event<{
	username?: string;
	alias?: string;
	}>;
	getInstance(forceNew: boolean): WorkspaceContext;
	getConnection(): Promise<Connection>;
	username(): string | undefined;
	alias(): string | undefined;
}

interface Connection {
	instanceUrl: string;
	getApiVersion(): string;
	getUsername(): string | undefined;
	getAuthInfoFields(): AuthFields;
	request<T>(options: { method: string; url: string; body: string; headers?: Record<string, string> }): Promise<T>;
}
  
  
