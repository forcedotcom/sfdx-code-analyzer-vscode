/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// extension names
export const EXTENSION_ID = 'salesforce.sfdx-code-analyzer-vscode';
export const CORE_EXTENSION_ID = 'salesforce.salesforcedx-vscode-core';
export const EXTENSION_PACK_ID = 'salesforce.salesforcedx-vscode';

// command names. These must exactly match the declarations in `package.json`.
export const COMMAND_RUN_ON_ACTIVE_FILE = 'sfca.runOnActiveFile';
export const COMMAND_RUN_ON_SELECTED = 'sfca.runOnSelected';
export const COMMAND_RUN_DFA_ON_SELECTED_METHOD = 'sfca.runDfaOnSelectedMethod';
export const COMMAND_RUN_DFA = 'sfca.runDfa';
export const COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE = 'sfca.removeDiagnosticsOnActiveFile';
export const COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE = 'sfca.removeDiagnosticsOnSelectedFile';
export const COMMAND_RUN_APEX_GURU_ON_FILE = 'sfca.runApexGuruAnalysisOnSelectedFile';
export const COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE = 'sfca.runApexGuruAnalysisOnCurrentFile';

// commands that are only invoked by quick fixes (which do not need to be declared in package.json since they can be registered dynamically)
export const QF_COMMAND_DIAGNOSTICS_IN_RANGE = 'sfca.removeDiagnosticsInRange';
export const QF_COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS = 'sfca.includeApexGuruSuggestions';
export const QF_COMMAND_A4D_FIX = 'sfca.a4dFix';

// telemetry event keys
export const TELEM_SETTING_USEV4 = 'sfdx__codeanalyzer_setting_useV4';
export const TELEM_SUCCESSFUL_STATIC_ANALYSIS = 'sfdx__codeanalyzer_static_run_complete';
export const TELEM_FAILED_STATIC_ANALYSIS = 'sfdx__codeanalyzer_static_run_failed';
export const TELEM_SUCCESSFUL_DFA_ANALYSIS = 'sfdx__codeanalyzer_dfa_run_complete';
export const TELEM_FAILED_DFA_ANALYSIS = 'sfdx__codeanalyzer_dfa_run_failed';
export const TELEM_SUCCESSFUL_APEX_GURU_FILE_ANALYSIS = 'sfdx__apexguru_file_run_complete';
export const TELEM_A4D_SUGGESTION = 'sfdx__eGPT_suggest';
export const TELEM_A4D_SUGGESTION_FAILED = 'sfdx__eGPT_suggest_failure';
export const TELEM_A4D_ACCEPT = 'sfdx__eGPT_accept';
export const TELEM_A4D_REJECT = 'sfdx__eGPT_clear';

// versioning
export const MINIMUM_REQUIRED_VERSION_CORE_EXTENSION = '58.4.1';
export const CODE_ANALYZER_V5_TEMPLATE = 'code-analyzer 5.';
export const CODE_ANALYZER_V5_ALPHA_TEMPLATE = 'code-analyzer 5.0.0-alpha';

// cache names
export const WORKSPACE_DFA_PROCESS = 'dfaScanProcess';

// apex guru APIS
export const APEX_GURU_AUTH_ENDPOINT = '/services/data/v62.0/apexguru/validate'
export const APEX_GURU_REQUEST = '/services/data/v62.0/apexguru/request'
export const APEX_GURU_MAX_TIMEOUT_SECONDS = 60;
export const APEX_GURU_RETRY_INTERVAL_MILLIS = 1000;
