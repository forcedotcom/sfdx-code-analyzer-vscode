import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
	tests: [{
		files: `./out/test/legacy/**/*.test.js`,
		installExtensions: ['salesforce.salesforcedx-vscode']
	}],
	coverage: {
		includeAll: true,
		reporter: ["text", "lcov"]
	}
});
