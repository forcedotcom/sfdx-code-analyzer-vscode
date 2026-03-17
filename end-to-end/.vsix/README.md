# E2E dependency VSIXs (Core & Services)

When **Core** and **Services** `.vsix` files are present here, the E2E test run uses them instead of installing from the marketplace. This is useful for testing with unpublished builds (e.g. a specific release or a fork).

## Required files

Place these two files in this directory (exact names):

- `salesforcedx-vscode-core.vsix`
- `salesforcedx-vscode-services.vsix`

If your VSIXs have versioned names (e.g. `salesforcedx-vscode-core-66.1.1.vsix`), copy or rename them to the names above.

## One-time setup from a zip

1. Unzip your "VS Code Extensions" zip (e.g. from [Salesforce Extension Pack releases](https://github.com/forcedotcom/salesforcedx-vscode/releases)) to a folder.
2. From the repo root, run:
   ```bash
   ./scripts/setup-e2e-vsix.sh "/path/to/unzipped/folder"
   ```
   Example (after unzipping `VS Code Extensions (13).zip` to your Downloads folder):
   ```bash
   ./scripts/setup-e2e-vsix.sh "$HOME/Downloads/VS Code Extensions (13)"
   ```
3. Commit the two `.vsix` files in `end-to-end/.vsix/` and push. The PR workflow will use them for E2E.

## Without local VSIXs

If this folder has no `.vsix` files, E2E installs **Core** and **Services** from the VS Code marketplace.
