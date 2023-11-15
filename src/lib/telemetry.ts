/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { CoreExtensionService, Properties } from './core-extension-service';

export class TelemetryService {
	public static sendCommandEvent(key: string, data: Properties): void {
		const coreTelemetryService = CoreExtensionService.getTelemetryService();
		coreTelemetryService.sendCommandEvent(key, undefined, data);
	}

	public static sendException(name: string, message: string, data?: Record<string, string>): void {
		const coreTelemetryService = CoreExtensionService.getTelemetryService();
		message += data ? JSON.stringify(data) : '';
		coreTelemetryService.sendException(name, message);
	}
}

