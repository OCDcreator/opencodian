# OpenCodian Agent Guide

OpenCodian is an Obsidian plugin that embeds OpenCode into the sidebar. Keep this file short: it should help an agent start work quickly, not duplicate the repo's full documentation set.

## Scope

- Make targeted TypeScript, UI, config, and documentation changes for the plugin.
- Prefer `rg`, small edits, and the smallest meaningful validation first.
- Avoid unrelated refactors and avoid editing `reference-projects/` unless the task explicitly asks for it.

## Quick Commands

```bash
npm install
npm run build
npm run test
npm run lint
npm run check:devlog-order
```

Use `npm run doctor:esbuild` only after dependency changes or when build/dev reports an esbuild platform mismatch.

## Current Architecture

- `src/main.ts`: plugin entry point. It initializes storage, settings normalization, locale, OpenCode services, commands, and view registration.
- `src/core/opencode/OpenCodeService.ts`: hybrid OpenCode facade. SDK v2 is the main path, but legacy HTTP/SSE fallback paths still exist and must not be removed casually.
- `src/core/opencode/ServerManager.ts`: owns the local OpenCode process lifecycle.
- `src/features/chat/OpenCodianView.ts`: main chat runtime. It supports concurrent tab/session streaming; do not collapse it back to a single global stream state.
- `src/features/chat/services/ContextUsageService.ts`, `src/features/chat/userMessageDisplay.ts`, and `src/features/chat/userMessageActions.ts`: newer chat responsibilities have been split out of `OpenCodianView`; prefer extending those helpers before adding more view-local complexity.
- `src/core/config/ModelConfigService.ts` + `src/core/config/OpencodeConfigManager.ts`: merge local config and server catalogs. Preserve the distinction between `baseEffective` and filtered `effective`.
- `src/core/storage/StorageService.ts`: local-first persistence for full conversations plus theme backgrounds and provider-icon assets.
- `src/features/settings/OpenCodianSettings.ts` + `src/core/types/settings.ts`: the settings surface is large and heavily normalized; UI changes often require matching default, migration, style, and locale updates.
- `src/features/chat/liquidDiamondDemo.ts`, `src/features/chat/liquidDiamondDemoWebgl.ts`, and `src/features/chat/glassOctahedronDemo.ts`: experimental visual demos. Keep them opt-in and do not expose them in stable UI paths by accident.

## Non-Obvious Rules

- Model availability is resolved in layers: provider toggles live in local `.opencode` config, per-model toggles live in plugin `disabledModelRefs`, and the chat/title-generation flows consume the filtered catalog.
- For OpenCode provider/config bugs, prefer live debugging against the local service before changing logic: `config.providers` is the current directory-scoped runtime list, `config.get(directory)` is the current vault's resolved config, `provider.list` is the current scope's filtered connect-provider directory, and plain `/config` without `directory` is only the server process default working-directory scope, not a pure global config file. On Windows, direct HTTP repros must use forward-slash `directory` values (for example `C:/vault`); `sdkFetch.ts` now normalizes `C:\vault` before `requestUrl`, but ad-hoc requests still need to match that behavior.
- Conversation restore is preload-sensitive: `main.ts` must finish `loadConversations()` before chat views restore their state.
- OMO compatibility spans `src/core/opencode/omoCompat.ts`, message normalization in `OpenCodeService`, and chat rendering in `OpenCodianView`.
- Theme, background, glass, and assistant metadata styling changes usually need coordinated updates across `src/core/theme/`, `src/core/types/settings.ts`, `src/main.ts`, `src/features/chat/OpenCodianView.ts`, `src/features/settings/OpenCodianSettings.ts`, `styles.css`, and both locale files.
- Module-level docs already exist for almost every `src/**/*.ts` file. Prefer updating the matching `docs/modules/**` page instead of expanding this file.

## Build And Deploy

- For code, style, manifest, or build-pipeline changes, run `npm run build` first.
- After a successful build, copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the Test Vault plugin directory:
  `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- Build and copy must be separate sequential steps. Do not chain them with `&&`, do not parallelize them, and do not verify deployment before the copy completes.
- After deployment, verify the Test Vault `main.js` contains the newest `BUILD_ID` from that build.
- Docs-only changes usually do not require build/deploy unless the user asks for it.

## Documentation Map

- Docs index and folder guide: `docs/README.md`
- Current architecture overview: `docs/architecture/README.md`
- Module index and per-file docs: `docs/modules/README.md`
- Build pipeline / scripts / test framework: `docs/modules/infrastructure/`
- SDK v2 rollout status: `docs/status/sdk-v2-rollout.md`
- SDK manual verification: `docs/status/sdk-v2-manual-checklist.md`
- Obsidian linkage status: `docs/requirements/obsidian-linkage.md`
- OMO compatibility / plugin requirements: `docs/requirements/`
- Server API reference: `SERVER_API.md`
- Development log: `devlog.md`

## Common Sync Checklists

- Model selection changes: update `ModelConfigService`, settings UI, `disabledModelRefs` handling, title-generation fallback, and any provider-icon refresh behavior.
- Question card changes: update `OpenCodeService` question methods, `OpenCodianView`, `QuestionDock`, conversation settings, and locale strings together.
- Chat appearance changes: keep theme presets, normalized settings, CSS variables, settings UI, and rendering behavior aligned.
- Streaming or tab changes: preserve per-tab runtime ownership and concurrent-session behavior.
- If behavior changes materially, refresh the corresponding file under `docs/modules/`.

## Devlog Rule

When updating `devlog.md`, insert the new dated section before the first existing dated `## YYYY-MM-DD ...` heading and run `npm run check:devlog-order`.
