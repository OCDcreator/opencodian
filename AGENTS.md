# OpenCodian Agent Guide

OpenCodian is an Obsidian plugin that embeds OpenCode into the sidebar. Keep this file short: it should help an agent start work quickly, not duplicate the repo's full documentation set.

## Scope

- Make targeted TypeScript, UI, config, and documentation changes for the plugin.
- Prefer `rg`, small edits, and the smallest meaningful validation first.
- Avoid unrelated refactors and avoid editing `reference-projects/` unless the task explicitly asks for it.

## Quick Commands

```bash
npm install
npm run verify
npm run build
npm run test
npm run lint
npm run check:module-docs
npm run check:devlog-order
```

Use `npm run doctor:esbuild` only after dependency changes or when build/dev reports an esbuild platform mismatch.

## Maintainability Guardrails

- Treat `npm run verify` as the default pre-merge gate: lint, typecheck, full tests, and production build must stay green.
- Treat lint warnings as blockers; do not merge with anything above `0 errors / 0 warnings`.
- Treat `npm run check:module-docs` as a hard gate: added, changed, renamed, and deleted source modules must keep `docs/modules/**` in sync.
- Do not add thin helper / adapter / provider / factory files unless reused in 3+ places or isolating a high-risk dependency.
- Prefer extending existing service / coordinator / runtime owners over adding new indirection layers.
- Do not grow `src/features/chat/OpenCodianView.ts` or `src/core/opencode/OpenCodeService.ts` with new runtime ownership; move stable responsibilities to adjacent owners when touching them.
- If a module boundary changes, update the matching `docs/modules/**` page and keep `docs/status/development-maintainability-rules.md` aligned.
- Use `npm run list:module-docs -- --range HEAD` for local uncommitted work and `node scripts/check-module-doc-diff.mjs --range origin/main...HEAD` for branch review / CI.

## Current Architecture

- `src/main.ts`: plugin entry point. It initializes storage, settings normalization, locale, OpenCode services, commands, and view registration.
- `src/core/opencode/OpenCodeService.ts`: hybrid OpenCode facade. SDK v2 is the main path, but legacy HTTP/SSE fallback paths still exist and must not be removed casually.
- `src/core/opencode/OpenCodeSdkFacade.ts`: thin SDK namespace wrapper. Keep request option injection, response unwrapping, and error normalization centralized here instead of reimplementing them ad hoc in callers.
- `src/core/opencode/OpenCodeService.ts`: `global.syncEvent.subscribe()` now also bridges `message.updated`, `message.part.updated`, and `session.diff` for the view; keep message-layer sync signals separate from foreground `session.status`.
- `src/core/opencode/ServerManager.ts`: owns the local OpenCode process lifecycle and managed-server adoption; if a previously managed local `4096` server no longer matches the current vault/mode/config signature, restart it instead of silently reusing it.
- `src/features/chat/OpenCodianView.ts`: main chat runtime. It supports concurrent tab/session streaming; do not collapse it back to a single global stream state. Background tasks now render as inline per-turn status plus delayed persisted completion notices, and `session.status` only reflects the foreground runner, not background-task completion.
- `src/features/chat/OpenCodianView.ts`: conversation reload now has a hydration/auth-sync phase; do not eagerly downgrade background tasks to stale before at least one authoritative message sync finishes, and preserve the current bottom/distance/anchor scroll-restore behavior.
- `src/features/chat/services/SlashCommandMenuCatalogCache.ts`: caches the merged slash command catalog for `/` autocomplete. If slash entries need to reflect new settings or a restarted server immediately, invalidate it instead of waiting for the 120s TTL.
- `src/features/chat/services/ContextUsageService.ts`, `src/features/chat/services/ScrollManager.ts`, `src/features/chat/ui/modelSelectorStickyHeaders.ts`, `src/features/chat/userMessageDisplay.ts`, and `src/features/chat/userMessageActions.ts`: newer chat responsibilities have been split out of `OpenCodianView`; prefer extending those helpers before adding more view-local complexity.
- `src/shared/toolIdentity.ts` + `src/utils/streaming/ToolCallRenderer.ts` + `src/utils/streaming/mcpSummaryConfig.ts`: tool kind/icon/summary rules are centralized here. MCP summaries now classify by tool-name action words and only inspect top-level input fields; keep `custom` tool behavior separate.
- `src/core/config/ModelConfigService.ts` + `src/core/config/OpencodeConfigManager.ts`: merge local config and server catalogs. Preserve the distinction between `baseEffective` and filtered `effective`.
- `src/core/storage/StorageService.ts`: local-first persistence for full conversations plus theme backgrounds and provider-icon assets.
- `src/utils/icons/ProviderIconService.ts` + `src/utils/icons/builtinIconRegistry.ts`: provider icon resolution now spans LobeHub mapped icons, bundled OpenCode builtin icons, and user custom sources; preserve the current fallback order instead of adding ad-hoc matching elsewhere.
- `src/features/settings/OpenCodianSettings.ts` + `src/core/types/settings.ts`: the settings surface is large and heavily normalized; UI changes often require matching default, migration, style, and locale updates.
- `src/features/settings/ProviderIconCacheModal.ts` + `src/features/settings/ProviderBuiltinIconPickerModal.ts`: provider icon management lives in the existing cache modal; prefer extending that flow instead of adding a separate settings page for builtin icon selection.
- `src/features/chat/liquidDiamondDemo.ts`, `src/features/chat/liquidDiamondDemoWebgl.ts`, and `src/features/chat/glassOctahedronDemo.ts`: experimental visual demos. Keep them opt-in and do not expose them in stable UI paths by accident.

## Non-Obvious Rules

- Model availability is resolved in layers: provider toggles live in local `.opencode` config, per-model toggles live in plugin `disabledModelRefs`, and the chat/title-generation flows consume the filtered catalog.
- For OpenCode provider/config bugs, prefer live debugging against the local service before changing logic: `config.providers` is the current directory-scoped runtime list, `config.get(directory)` is the current vault's resolved config, `provider.list` is the current scope's filtered connect-provider directory, and plain `/config` without `directory` is only the server process default working-directory scope, not a pure global config file. On Windows, direct HTTP repros must use forward-slash `directory` values (for example `C:/vault`); `sdkFetch.ts` now normalizes `C:\vault` before `requestUrl`, but ad-hoc requests still need to match that behavior.
- Do not treat inherited/server `disabled_providers` as proof that a provider vanished from the runtime catalog: if `opencode models` / `config.providers(directory)` still returns that provider, `服务器目录` should still show it. Disable arrays are config-layer availability signals, and project-local overrides should be allowed to narrow or clear inherited disables instead of being documented as “hard-disabled”. If plugin counts suddenly diverge from `opencode models`, first suspect a stale managed local `4096` server or wrong `directory` scope before touching merge/filter logic.
- Conversation restore is preload-sensitive: `main.ts` must finish `loadConversations()` before chat views restore their state.
- OMO compatibility spans `src/core/opencode/omoCompat.ts`, message normalization in `OpenCodeService`, and chat rendering in `OpenCodianView`.
- Theme, background, glass, and assistant metadata styling changes usually need coordinated updates across `src/core/theme/`, `src/core/types/settings.ts`, `src/main.ts`, `src/features/chat/OpenCodianView.ts`, `src/features/settings/OpenCodianSettings.ts`, `src/style/`, the generated `styles.css`, and both locale files.
- Module-level docs already exist for almost every `src/**/*.ts` file. Prefer updating the matching `docs/modules/**` page instead of expanding this file.

## Build And Deploy

- For code, style, manifest, or build-pipeline changes, run `npm run build` first.
- A successful `npm run build` must be followed immediately by Test Vault deployment only when the change touches deploy-relevant runtime files (`src/main.ts`, `manifest.json`, `styles.css`, `assets/`, `src/style/`, `src/core/theme/`, `src/features/settings/`) or when the user explicitly asks to deploy.
- After a successful build, copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the Test Vault plugin directory:
  `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- If the user asks to “部署到测试库”, treat that as the standard Test Vault deployment flow above; just perform the sequential copy + `BUILD_ID` verification and report the result briefly instead of re-explaining the whole process each time.
- `npm run build` now includes the CSS merge step automatically; if you only need to refresh the generated root `styles.css`, run `npm run build:css`.
- If the change touches bundled assets (for example `assets/`, provider icons, branding, or other runtime-loaded files), also copy `dist/assets/` into that same Test Vault plugin directory before verification.
- For pure maintainability refactors outside the deploy-relevant paths above, a successful build does not require Test Vault deployment.
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
- Added / deleted / renamed modules: update the mapped `docs/modules/**` page plus any surfaced `index.md` / `docs/modules/README.md` entries from the module-doc guard helper.
- If behavior changes materially, refresh the corresponding file under `docs/modules/`.

## Devlog Rule

When updating `devlog.md`, insert the new dated section before the first existing dated `## YYYY-MM-DD ...` heading and run `npm run check:devlog-order`.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
