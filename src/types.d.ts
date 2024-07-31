/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
// TODO: Consider exporting these types from SFCA instead of defining them here.
export type BaseViolation = {
	ruleName: string;
	message: string;
	severity: number;
	normalizedSeverity?: number;
	category: string;
	url?: string;
	exception?: boolean;
};

export type PathlessRuleViolation = BaseViolation & {
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
};

export type DfaRuleViolation = BaseViolation & {
	sourceLine: number;
	sourceColumn: number;
	sourceType: string;
	sourceMethodName: string;
	sinkLine: number|null;
	sinkColumn: number|null;
	sinkFileName: string|null;
};

export type RuleViolation = PathlessRuleViolation | DfaRuleViolation;

export type RuleResult = {
    engine: string;
    fileName: string;
    violations: RuleViolation[];
};

export type ExecutionResult = {
    status: number;
    result?: RuleResult[]|string;
    warnings?: string[];
	message?: string;
};

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

export type ApexGuruAuthResponse = {
    status: string;
}

export type ApexGuruInitialResponse = {
    status: string;
	requestId: string;
	message: string;
}

export type ApexGuruQueryResponse = {
	status: string;
	message: string;
	report: string;
}

export type ApexGuruProperty = {
    name: string;
    value: string;
};

export type ApexGuruReport = {
	id: string;
    type: string;
    value: string;
    properties: ApexGuruProperty[];
}