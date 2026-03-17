#!/usr/bin/env node
/**
 * Runs E2E tests with SFCA_E2E_LOG_DIR set so the extension writes logs to
 * sampleWorkspace/.sfca-e2e.log (same path the GHA workflow cats).
 * Required because @vscode/test-cli may spawn VS Code from a process that
 * never loaded .vscode-test.mjs, so env set there doesn't reach the extension host.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SFCA_E2E_LOG_DIR = path.resolve(__dirname, 'sampleWorkspace');

const result = spawnSync('npx', ['vscode-test'], {
  stdio: 'inherit',
  env: process.env,
  cwd: __dirname,
  shell: true,
});
process.exit(result.status ?? 1);
