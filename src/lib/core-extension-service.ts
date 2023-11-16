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


export class CoreExtensionService {
	private static initialized = false;
	private static telemetryService: TelemetryService;

	public static async loadDependencies(context: vscode.ExtensionContext): Promise<void> {
		if (!CoreExtensionService.initialized) {
			const coreExtension = vscode.extensions.getExtension(CORE_EXTENSION_ID);
			if (!coreExtension) {
				throw new Error(messages.error.coreExtensionMissing);
			}
			// We konw that there has to be a version property on the package.json.
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const coreExtensionVersion = (coreExtension.packageJSON.version) as string;
			if (!this.isAboveMinimumRequiredVersion(MINIMUM_REQUIRED_VERSION_CORE_EXTENSION, coreExtensionVersion)) {
				throw new Error(messages.error.coreExtensionOutdated);
			}

			const coreExtensionApi = coreExtension.exports as CoreExtensionApi;

			await CoreExtensionService.initializeTelemetryService(coreExtensionApi?.services.TelemetryService, context);
			CoreExtensionService.initialized = true;
		}
	}

	/**
	 * Verifies that the current version of a dependency is at least as recent as the minimum required version.
	 * @param minRequiredVersion
	 * @param actualVersion
	 */
	private static isAboveMinimumRequiredVersion(minRequiredVersion: string, actualVersion: string): boolean {
		return satisfies(actualVersion, ">=" + minRequiredVersion);
	}

	private static async initializeTelemetryService(telemetryService: TelemetryService | undefined, context: vscode.ExtensionContext): Promise<void> {
		if (!telemetryService) {
			throw new Error(messages.error.telemetryServiceMissing);
		}

		CoreExtensionService.telemetryService = telemetryService.getInstance();
		await CoreExtensionService.telemetryService.initializeService(context);
	}

	public static getTelemetryService(): TelemetryService {
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
