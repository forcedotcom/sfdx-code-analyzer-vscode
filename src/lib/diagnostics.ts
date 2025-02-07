/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {messages} from './messages';
import * as vscode from 'vscode';

type DiagnosticConvertibleLocation = {
	file: string;
	startLine: number;
	startColumn: number;
	endLine?: number;
	endColumn?: number;
	comment?: string;
}

export type DiagnosticConvertible = {
	rule: string;
	engine: string;
	message: string;
	severity: number;
	locations: DiagnosticConvertibleLocation[];
	primaryLocationIndex: number;
	resources: string[];
	currentCode?: string;
	suggestedCode?: string;
}

export interface DiagnosticManager {
	displayAsDiagnostics(allTargets: string[], convertibles: DiagnosticConvertible[]): void;
}

export class DiagnosticManagerImpl implements DiagnosticManager {
	private diagnosticCollection: vscode.DiagnosticCollection;

	public constructor(diagnosticCollection: vscode.DiagnosticCollection) {
		this.diagnosticCollection = diagnosticCollection;
	}

	/**
	 *
	 * @param allTargets The names of EVERY file targeted by a particular scan
	 * @param convertibles DiagnosticConvertibles created as a result of a scan
	 */
	public displayAsDiagnostics(allTargets: string[], convertibles: DiagnosticConvertible[]): void {
		const convertiblesByTarget: Map<string, DiagnosticConvertible[]> = this.mapConvertiblesByTarget(convertibles);

		for (const target of allTargets) {
			const targetUri = vscode.Uri.file(target);
			const convertiblesForTarget: DiagnosticConvertible[] = convertiblesByTarget.get(target) || [];
			this.diagnosticCollection.set(targetUri, convertiblesForTarget.map((c) => this.convertToDiagnostic(c)));
		}
	}

	private mapConvertiblesByTarget(convertibles: DiagnosticConvertible[]): Map<string, DiagnosticConvertible[]> {
		const convertibleMap: Map<string, DiagnosticConvertible[]> = new Map();
		for (const convertible of convertibles) {
			const primaryLocation: DiagnosticConvertibleLocation = convertible.locations[convertible.primaryLocationIndex];
			const primaryFile: string = primaryLocation.file;
			const convertiblesMappedToPrimaryFile: DiagnosticConvertible[] = convertibleMap.get(primaryFile) || [];
			convertibleMap.set(primaryFile, [...convertiblesMappedToPrimaryFile, convertible]);
		}
		return convertibleMap;
	}

	private convertToDiagnostic(convertible: DiagnosticConvertible): vscode.Diagnostic {
		const primaryLocation: DiagnosticConvertibleLocation = convertible.locations[convertible.primaryLocationIndex];
		const primaryLocationRange = this.convertToRange(primaryLocation);

		const diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
			primaryLocationRange,
			messages.diagnostics.messageGenerator(convertible.severity, convertible.message.trim()),
			vscode.DiagnosticSeverity.Warning
		);
		diagnostic.source = messages.diagnostics.source.generator(convertible.engine);
		diagnostic.code = convertible.resources.length > 0 ? {
			target: vscode.Uri.parse(convertible.resources[0]),
			value: convertible.rule
		} : convertible.rule;

		// TODO: If possible, convert this engine-specific handling to something more generalized.
		if (convertible.engine === 'apexguru') {
			if (convertible.suggestedCode) {
				diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(vscode.Uri.parse(convertible.resources[0]), primaryLocationRange),
                        `\n// Current Code: \n${convertible.currentCode}`
                    ),
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(vscode.Uri.parse(convertible.resources[0]), primaryLocationRange),
                        `/*\n//ApexGuru Suggestions: \n${convertible.suggestedCode}\n*/`
                    )
                ]
			}
		}

		if (convertible.locations.length > 1) {
			const relatedLocations: vscode.DiagnosticRelatedInformation[] = [];
			for (let i = 0 ; i < convertible.locations.length; i++) {
				if (i !== convertible.primaryLocationIndex) {
					const relatedLocation = convertible.locations[i];
					const relatedRange = this.convertToRange(relatedLocation);
					const vscodeLocation: vscode.Location = new vscode.Location(vscode.Uri.file(relatedLocation.file), relatedRange);
					relatedLocations.push(new vscode.DiagnosticRelatedInformation(vscodeLocation, relatedLocation.comment));
				}
			}
			diagnostic.relatedInformation = relatedLocations;
		}
		return diagnostic;
	}

	private convertToRange(locationConvertible: DiagnosticConvertibleLocation): vscode.Range {
		// VSCode Positions are 0-indexed, so we need to subtract 1 from the violation's position information.
		// However, in certain cases, a violation's location might be line/column 0 of a file, and we can't use negative
		// numbers here. So don't let ourselves go below 0.
		const startLine = Math.max(locationConvertible.startLine - 1, 0);
		const startColumn = Math.max(locationConvertible.startColumn - 1, 0);
		// If there's no explicit end line, just use the start line.
		const endLine = locationConvertible.endLine != null ? locationConvertible.endLine - 1 : startLine;
		// If there's no explicit end column, just highlight everything through the end of the line.
		const endColumn = locationConvertible.endColumn != null ? locationConvertible.endColumn - 1 : Number.MAX_SAFE_INTEGER;

		const startPosition: vscode.Position = new vscode.Position(startLine, startColumn);
		const endPosition: vscode.Position = new vscode.Position(endLine, endColumn);

		return new vscode.Range(startPosition, endPosition);
	}
}
