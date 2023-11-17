/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import { satisfies } from 'semver';
import {messages} from './messages';

import { CORE_EXTENSION_ID, MINIMUM_REQUIRED_VERSION_CORE_EXTENSION } from './constants';

/**
 * Manages access to the services exported by the Salesforce VSCode Extension Pack's core extension.
 * If the extension pack isn't installed, only performs no-ops.
 */
export class CoreExtensionService {
	private static initialized = false;
	private static telemetryService: TelemetryService;

	public static async loadDependencies(context: vscode.ExtensionContext): Promise<void> {
		if (!CoreExtensionService.initialized) {
			const coreExtensionApi = await this.getCoreExtensionApiOrUndefined();

			await CoreExtensionService.initializeTelemetryService(coreExtensionApi?.services.TelemetryService, context);
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
	private static isAboveMinimumRequiredVersion(minRequiredVersion: string, actualVersion: string): boolean {
		return satisfies(actualVersion, ">=" + minRequiredVersion);
	}

	/**
	 * Initializes a {@link TelemetryService} instance of the provided class, or a {@link NoOpTelemetryService} if none was provided
	 * @param telemetryService
	 * @param context
	 */
	private static async initializeTelemetryService(telemetryService: TelemetryService | undefined, context: vscode.ExtensionContext): Promise<void> {
		if (!telemetryService) {
			console.log(`Telemetry service not present in core dependency API. Using null instead.`);
			CoreExtensionService.telemetryService = null;
		} else {
			CoreExtensionService.telemetryService = telemetryService.getInstance();
			await CoreExtensionService.telemetryService.initializeService(context);
		}
	}

	/**
	 *
	 * @returns The {@link TelemetryService} object exported by the Core Extension if available, else null.
	 */
	public static getTelemetryService(): TelemetryService|null {
		if (CoreExtensionService.initialized) {
			return CoreExtensionService.telemetryService;
		}
		throw new Error(messages.error.coreExtensionServiceUninitialized);
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
interface TelemetryService {
	extensionName: string;
	isTelemetryEnabled(): boolean;
	getInstance(): TelemetryService;
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
		TelemetryService: TelemetryService;
	}
}
