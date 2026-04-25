# Autopilot Phase 1 — `a2-mcp-settings`

## Round Design

- **Queued slice**: `[NEXT] M1 - Add the Server > MCP settings surface and runtime status refresh`
- **Queue truth note**: the roadmap still marks `M1` as `[NEXT]`, so this round stays on `M1` even though the focus hint mentions `M2`
- **Active spec**: `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
- **External reference**: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`
- **Targeted files/modules**:
  - `src/features/settings/SettingsMcpSection.ts`
  - `src/features/settings/settingsLayoutRegistry.ts`
  - `src/features/settings/SettingsTabbedRenderer.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/SettingsServerSection.ts` only for bounded Server-domain composition
  - `src/i18n/locales/en.ts` and `src/i18n/locales/zh.ts`
  - matching `tests/unit/features/settings/`, matching `docs/modules/features/settings/`, and matching locale docs
  - `src/core/opencode/OpenCodeService.ts` only if the existing snapshot/subscription seam proves insufficient after review
- **Upstream/runtime contract to confirm**:
  - MCP settings must stay under the existing `Server` domain rather than becoming a new top-level page.
  - Runtime truth comes from `mcp.status` / `mcp.tools.changed`; the settings UI should consume `OpenCodeService.refreshMcpServerStatus()`, `getMcpServerSnapshot()`, and `subscribeToCatalogUpdates()` instead of calling SDK namespaces directly.
  - `McpServerStatus` remains the only status enum for this slice (`connected`, `disabled`, `failed`, `needs_auth`, `needs_client_registration`), and overview/server rows should render directly from that runtime snapshot.
  - Opening `Server > MCP` and explicit refresh actions must trigger a real MCP status refresh; this round must not add optimistic fake state or jump ahead to M2 actions/forms.
- **Targeted tests to run**:
  - focused Jest for `SettingsMcpSection`, `settingsLayoutRegistry`, and `SettingsTabbedRenderer`
  - focused Jest for `SettingsServerSection` and/or `OpenCodianSettings` if their routing changes materially
  - `npm run check:module-docs`
  - `npm run verify`
- **Deploy-required paths likely touched**: `Yes`. The slice is expected to touch `src/features/settings/` and locale files, so a successful verified round will require Test Vault deployment and `BUILD_ID` verification.
- **Non-goals / boundaries**:
  - no MCP connect/disconnect/auth/clear-auth buttons yet; those belong to `M2`
  - no local/remote add-server form yet; that also belongs to `M2`
  - no MCP tool identity / history / streaming work; that belongs to `M3`
  - no direct SDK calls from settings UI, no new top-level MCP page, and no expansion into MCP resources/prompts

## Design Review Result

- **Verdict**: `PASS`
- **Why this design is ready**:
  - The queue/spec/reference all align on a bounded first MCP slice: add the `Server > MCP` surface, show runtime status/counts, and refresh from existing service/query seams without starting the action/form work reserved for `M2`.
  - The current codebase already has the required runtime contract for `M1`: `OpenCodeService` exposes MCP refresh/snapshot/subscription seams, `OpenCodeCatalogStateStore` already tracks MCP snapshot timestamps, and `SettingsServerSection` / `SettingsTabbedRenderer` already own the Server-domain routing pattern that a new `mcp` secondary tab can extend.
  - A new `SettingsMcpSection` owner keeps the slice inside the existing architecture guardrails: it avoids regrowing `OpenCodianSettings.ts`, keeps MCP ownership in the Server settings domain, and reuses the current catalog listener model instead of inventing a parallel polling or SDK access path.
  - The design stays tightly inside the queue boundary by treating overview cards, server rows, and refresh behavior as the only user-facing deliverable for this round; connect/auth/add-server controls remain explicitly deferred to `M2`.
- **Risks watched during implementation**:
  - tabbed and classic layouts must stay coherent; if classic mode surfaces MCP status, it should do so through the same owner and runtime truth instead of a duplicate rendering path
  - the MCP tab must refresh on entry without leaking stale subscriptions or duplicate listeners across repeated settings re-renders
  - overview counts and server rows must degrade cleanly for empty snapshots, loading/refreshing state, and runtime errors without implying unsupported actions are available

## Implementation Summary

- **OpenCode pass result**:
  - added `SettingsMcpSection` as the new MCP settings owner, wired it into the tabbed `server > mcp` route, and mounted the same owner in classic layout immediately after the existing Server section
  - kept the data path inside existing runtime seams by consuming `OpenCodeService.getMcpServerSnapshot()`, `refreshMcpServerStatus()`, and `subscribeToCatalogUpdates()` rather than adding direct SDK calls from settings
  - added MCP-specific locale strings, focused Jest coverage, and module-doc updates for the new owner plus touched settings/locale modules
- **Codex review note**:
  - no additional app-code closeout was required after the OpenCode pass; the delivered slice stayed inside `M1` and left `M2` / `M3` work untouched

## Files Changed

- **Settings / locale**
  - `src/features/settings/SettingsMcpSection.ts`
  - `src/features/settings/SettingsTabbedRenderer.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/settingsLayoutRegistry.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
- **Tests**
  - `tests/unit/features/settings/SettingsMcpSection.test.ts`
  - `tests/unit/features/settings/SettingsTabbedRenderer.test.ts`
  - `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `tests/unit/features/settings/settingsLayoutRegistry.test.ts`
- **Module docs**
  - `docs/modules/features/settings/SettingsMcpSection.md`
  - `docs/modules/features/settings/SettingsTabbedRenderer.md`
  - `docs/modules/features/settings/OpenCodianSettings.md`
  - `docs/modules/features/settings/settingsLayoutRegistry.md`
  - `docs/modules/i18n/locales/en.md`
  - `docs/modules/i18n/locales/zh.md`
- **Lane tracking**
  - `docs/status/lanes/a2-mcp-settings/autopilot-phase-1.md`
  - `docs/status/lanes/a2-mcp-settings/autopilot-round-roadmap.md`

## Validation

- **Targeted Jest**
  - `npm test -- --runInBand --runTestsByPath tests/unit/features/settings/SettingsMcpSection.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/settingsLayoutRegistry.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `4` suites / `42` tests passed
- **Module docs**
  - `npm run check:module-docs`
  - coverage OK (`364` source modules / `364` mapped docs)
  - diff OK (`5` required doc targets)
- **Full verification**
  - `npm run verify`
  - module docs, lint, typecheck, full Jest (`331` suites / `1610` tests), and production build all passed
  - extracted `BUILD_ID`: `autopilot-agent-mcp-formatter-review-loop.202604251543`
- **Deploy verification**
  - copied verified `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
  - verified deployed `main.js` contains `BUILD_ID` `autopilot-agent-mcp-formatter-review-loop.202604251543`

## Code Review Result

- **Verdict**: `PASS`
- **Why the slice passes review**:
  - `M1` is delivered without lane hopping: the new work adds only the MCP status surface, refresh flow, tests, and docs; it does not start MCP actions/forms (`M2`) or MCP tool identity work (`M3`).
  - The implementation respects the existing architecture seam by keeping MCP UI reads inside `OpenCodeService` and catalog subscriptions rather than reaching into SDK namespaces from settings code.
  - `Server > MCP` now renders runtime-derived overview counts plus per-server rows, refreshes on tab entry, supports explicit refresh, and reacts to catalog updates, which matches the queued acceptance criteria.
  - Classic layout stays within the existing Server domain by mounting the MCP owner immediately after the Server section rather than creating a new top-level settings page.

## Outcome

- `M1` is complete and verified. The `a2-mcp-settings` lane now has the MCP status surface in place, with refreshable runtime truth visible in both tabbed and classic settings layouts.

## Next Recommended Slice

- `[NEXT] M2 - Implement MCP server operations and add-server forms`
