/**
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 **/
/* eslint-disable @typescript-eslint/no-var-requires */
const { build } = require('esbuild');

const production = process.argv.includes('--production');

build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2020',
  outdir: 'dist',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: !production,
  minify: production
}).catch((e) => {
  console.error(e);
  NodeJS.process.exit(1);
});