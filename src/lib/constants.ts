/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// extension names
export const CORE_EXTENSION_ID = 'salesforce.salesforcedx-vscode-core';
export const EXTENSION_PACK_ID = 'salesforce.salesforcedx-vscode';

// command names. These must exactly match the declarations in `package.json`.
export const COMMAND_RUN_ON_ACTIVE_FILE = 'sfca.runOnActiveFile';
export const COMMAND_RUN_ON_SELECTED = 'sfca.runOnSelected';
export const COMMAND_RUN_DFA_ON_SELECTED_METHOD = 'sfca.runDfaOnSelectedMethod';
export const COMMAND_RUN_DFA = 'sfca.runDfa';
export const COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE = 'sfca.removeDiagnosticsOnActiveFile';
export const COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE = 'sfca.removeDiagnosticsOnSelectedFile';
export const COMMAND_DIAGNOSTICS_IN_RANGE = 'sfca.removeDiagnosticsInRange'


// telemetry event keys
export const TELEM_SUCCESSFUL_STATIC_ANALYSIS = 'sfdx__codeanalyzer_static_run_complete';
export const TELEM_FAILED_STATIC_ANALYSIS = 'sfdx__codeanalyzer_static_run_failed';
export const TELEM_SUCCESSFUL_DFA_ANALYSIS = 'sfdx__codeanalyzer_dfa_run_complete';
export const TELEM_FAILED_DFA_ANALYSIS = 'sfdx__codeanalyzer_dfa_run_failed';


// versioning
export const MINIMUM_REQUIRED_VERSION_CORE_EXTENSION = '58.4.1';

// cache names
export const WORKSPACE_DFA_PROCESS = 'dfaScanProcess';

// apex guru APIS
export const APEX_GURU_AUTH_ENDPOINT = '/services/data/v62.0/apexguru/validate'

// feature gates
export const APEX_GURU_FEATURE_FLAG_ENABLED = false;
