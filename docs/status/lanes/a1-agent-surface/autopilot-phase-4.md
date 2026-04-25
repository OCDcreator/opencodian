# Autopilot Phase 4 — `a1-agent-surface`

## Round Design

- **Queued slice**: `[NEXT] A4 - Finish Agent Studio management surfaces`
- **Active spec**: `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
- **External reference**: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- **Primary-source contract check**:
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/config/agent.ts`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/config/markdown.ts`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/config/entry-name.ts`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/agent/agent.ts`
- **Targeted files/modules**:
  - `src/core/agents/MarkdownAgentWorkspaceService.ts`
  - `src/core/agents/AgentCatalogService.ts` and `src/core/agents/types.ts` only as needed to carry Markdown file truth into the unified catalog without collapsing runtime/config/file states
  - `src/core/agents/index.ts`
  - `src/features/settings/SettingsAgentsSection.ts`
  - `src/features/settings/SettingsProjectAgentEditor.ts`
  - `src/features/settings/settingsLayoutRegistry.ts` if the tabbed Agent Studio needs a dedicated Markdown workspace tab
  - `src/features/settings/SettingsCommandsSection.ts` only if a small command-to-agent status hint is required to keep the queued slice coherent
  - `src/i18n/locales/en.ts` and `src/i18n/locales/zh.ts`
  - matching `tests/unit/core/agents/`, matching `tests/unit/features/settings/`, and matching `docs/modules/**`
- **Upstream/runtime contract to confirm**:
  - OpenCode scans Markdown agents from `.opencode/agent/`, `.opencode/agents/`, `agent/`, and `agents/`, and derives the agent ID from the path segment under those roots rather than from a plugin-private registry.
  - Markdown agents are frontmatter + prompt-body files; the SDK/config API can list/configure agents but does not write Markdown agent files for us, so file CRUD must remain plugin-owned.
  - Runtime `app.agents()` can include hidden built-in system agents (`title`, `summary`, `compaction`), so the settings layer must filter default-primary choices from explicit runtime/config/file truth instead of assuming the runtime list is already UI-safe.
  - File write success, project-config write success, and runtime visibility are separate states. This slice must never claim runtime sync succeeded just because a file or config write succeeded.
- **Targeted tests to run**:
  - focused Jest for `MarkdownAgentWorkspaceService`, `SettingsAgentsSection`, and `SettingsProjectAgentEditor`
  - `tests/unit/features/settings/SettingsCommandsSection.test.ts` only if `SettingsCommandsSection.ts` changes
  - `tests/unit/core/agents/agentSurface.test.ts` if catalog/type behavior changes
  - `npm run check:module-docs`
  - `npm run verify`
- **Deploy-required paths likely touched**: `Yes`. This slice is expected to touch `src/features/settings/` and locale files, so a successful verified round will require Test Vault deployment and `BUILD_ID` verification.
- **Non-goals / boundaries**:
  - no new chat send-path, `@subagent`, child-session, MCP, or formatter work
  - no plugin-private agent orchestration or fake runtime-refresh claims
  - no command editor redesign beyond a minimal command-to-agent coherence hint if review proves it is necessary
  - no attempt to change OpenCode’s server-side Markdown parsing rules; the plugin only mirrors the upstream contract and surfaces divergence explicitly

## Design Review Result

- **Verdict**: `PASS`
- **Why this design is ready**:
  - The upstream OpenCode sources confirm the exact Markdown-agent contract this slice must mirror: file roots are `.opencode/agent(s)` and `agent(s)`, IDs come from the relative path under those roots, frontmatter becomes config fields, prompt body becomes the agent prompt, and hidden system agents still appear in the runtime registry.
  - The current repo gaps line up cleanly with the queued A4 boundary: `MarkdownAgentWorkspaceService` does not exist, `SettingsAgentsSection` still merges only runtime + project config and therefore misses file truth / system surfacing, and `SettingsProjectAgentEditor` cannot select runtime agents or enforce expert-mode gating for system overrides.
  - A bounded implementation can therefore stay inside the queued slice by adding one file-workspace owner, switching the settings layer to unified agent-surface inputs, extending the existing project-agent editor to handle runtime/system selections safely, and adding only the smallest tab/layout change needed to expose Markdown CRUD separately from project overrides.
  - The design also preserves the core lane rule that runtime truth, project-config truth, and file truth stay visibly separate: the markdown workspace can show `saved to file`, parse/duplicate errors, and `runtime seen` independently, while the unified catalog remains the read-side aggregation for agent selection and status labels.
- **Risks watched during implementation**:
  - duplicate IDs and parse errors must stay explicit in the Markdown workspace instead of being silently merged into a "successful" catalog entry
  - system-agent override writes and deletes must be blocked unless expert mode is actively enabled in the current settings session
  - default-primary choices must exclude hidden/system-only runtime entries even though `app.agents()` still returns them
  - if runtime still does not expose a just-saved Markdown agent, the UI must report that as pending/runtime-unseen rather than pretending the save refreshed the backend

## Implementation Summary

### OpenCode implementation passes

- **Pass 1** established the new `MarkdownAgentWorkspaceService` seam, extended `AgentCatalogService` to accept Markdown file truth, added the new workspace tab key, and started the focused tests/docs needed for the A4 slice.
- **Pass 2** fixed the initial empty-diff failure mode and landed the first repo-visible A4 patch, but Codex review still found compile breakage plus missing editor/workspace closeout.
- **Pass 3** addressed part of the follow-up review feedback (system-agent risk labels, runtime/system editor selection, workspace edit actions), but the OpenCode loop kept churning in self-review after the repo diff had been stable for a long stretch.

### Codex closeout after repeated narrowed OpenCode retries

- Completed the remaining bounded closeout work directly once the narrowed OpenCode retries had already landed the main slice shape but were no longer converging:
  - upgraded `MarkdownAgentWorkspaceService` from a line-based parser to real YAML parsing/serialization so malformed frontmatter becomes an explicit `parse-error`
  - finished the classic-layout Agent Studio surface so expert mode and the Markdown workspace appear in both classic and tabbed settings layouts
  - tightened the guarded config seam so system-agent delete flows are also blocked unless expert mode is enabled
  - improved runtime/system agent selection fallback in `SettingsProjectAgentEditor` and fixed the remaining workspace notice/status mismatches
  - synced the affected module docs and repaired the focused tests so the A4 slice verifies cleanly

## Files Changed

- **Core agent surface**
  - `src/core/agents/MarkdownAgentWorkspaceService.ts`
  - `src/core/agents/AgentCatalogService.ts`
  - `src/core/agents/SystemAgentGuardService.ts`
  - `src/core/agents/index.ts`
- **Settings / locale**
  - `src/features/settings/SettingsAgentsSection.ts`
  - `src/features/settings/SettingsProjectAgentEditor.ts`
  - `src/features/settings/settingsLayoutRegistry.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
- **Tests**
  - `tests/unit/core/agents/MarkdownAgentWorkspaceService.test.ts`
  - `tests/unit/core/agents/agentSurface.test.ts`
  - `tests/unit/features/settings/SettingsAgentsSection.test.ts`
- **Module docs / roadmap**
  - `docs/modules/core/agents/AgentCatalogService.md`
  - `docs/modules/core/agents/MarkdownAgentWorkspaceService.md`
  - `docs/modules/core/agents/SystemAgentGuardService.md`
  - `docs/modules/core/agents/index.md`
  - `docs/modules/features/settings/SettingsAgentsSection.md`
  - `docs/modules/features/settings/SettingsProjectAgentEditor.md`
  - `docs/modules/features/settings/settingsLayoutRegistry.md`
  - `docs/modules/i18n/locales/en.md`
  - `docs/modules/i18n/locales/zh.md`
  - `docs/status/lanes/a1-agent-surface/autopilot-round-roadmap.md`

## Validation

- **Focused Jest**
  - `npm test -- --runInBand --runTestsByPath tests/unit/core/agents/MarkdownAgentWorkspaceService.test.ts tests/unit/core/agents/agentSurface.test.ts tests/unit/features/settings/SettingsAgentsSection.test.ts`
  - `3` suites / `59` tests passed
- **Module docs**
  - `npm run check:module-docs`
  - coverage OK (`363` source modules / `363` mapped docs)
  - diff OK (`8` required doc targets)
- **Full verification**
  - `npm run verify`
  - module docs, lint, typecheck, full Jest (`330` suites / `1601` tests), and production build all passed
  - extracted `BUILD_ID`: `autopilot-agent-mcp-formatter-review-loop.202604251311`
- **Deploy verification**
  - copied verified `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
  - verified deployed `main.js` contains `BUILD_ID` `autopilot-agent-mcp-formatter-review-loop.202604251311`

## Code Review Result

- **Verdict**: `PASS`
- **Why the slice passes review**:
  - A4 now exposes the missing Agent Studio surface end-to-end: runtime/config/file agents flow through `AgentCatalogService`, the new Markdown workspace can create/edit/delete Markdown agent files, and system-agent overrides are guarded behind explicit expert mode.
  - The implementation keeps truth layers visibly separate: Markdown file rows show parse status + runtime visibility independently, while project override writes still go only through the guarded config seam.
  - The project-agent editor can now target runtime/system agents directly, so system-agent override work is no longer hidden behind manual ID typing.
  - The round stayed inside `a1-agent-surface` and did not start MCP or formatter work.

## Outcome

- A4 is complete and verified. The `a1-agent-surface` lane is now fully done, including project override management, Markdown agent file CRUD/sync-state surfacing, and expert-gated system-agent overrides.

## Next Recommended Slice

- `[NEXT] M1 - Add the Server > MCP settings surface and runtime status refresh`
