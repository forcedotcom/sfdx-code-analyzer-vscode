/**
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 **/
/* eslint-disable @typescript-eslint/no-var-requires */
const { build } = require('esbuild');

const production = process.argv.includes('--production');

/**
 * TODO: We have entryPoints and outfile to be the same since runTests looks for the extension's main to be at
 * 'out/' as defined in package.json.We should refactor the tests not to rely on package.json and until then,
 * the entryPoints and outfile will be the same with allowOverwrite set ti true.
 */
build({
  entryPoints: ['out/extension.js'],
  bundle: true,
  platform: 'node',
  target: 'es2020',
  outfile: 'out/extension.js',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  allowOverwrite: true
}).catch((e) => {
  console.error(e);
  NodeJS.process.exit(1);
});