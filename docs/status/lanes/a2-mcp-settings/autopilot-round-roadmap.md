# Autopilot Round Roadmap — `a2-mcp-settings`

## Queue

### [DONE] M1 - Add the Server > MCP settings surface and runtime status refresh

- **Lane**: MCP settings shell
- **Goal**: Add the `Server > MCP` secondary tab and the initial `SettingsMcpSection` owner that can render runtime MCP status, summary counts, and refresh state through existing OpenCode service/query seams.
- **Priority entrypoints**:
  - `src/features/settings/SettingsMcpSection.ts`
  - `src/features/settings/settingsLayoutRegistry.ts`
  - `src/features/settings/SettingsTabbedRenderer.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - matching tests/docs/locales
- **References**:
  - `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`
- **Constraints**:
  - Keep MCP under the existing Server settings page.
  - Do not introduce a separate top-level MCP page.
  - Reuse current service/query owners instead of direct SDK calls from the UI.
- **Acceptance**:
  - `Server > MCP` renders with overview cards and server rows from runtime truth.
  - Opening or refreshing the tab triggers MCP status refresh.
  - Tests cover rendered state combinations and refresh behavior.

### [DONE] M2 - Implement MCP server operations and add-server forms

- **Lane**: MCP management actions
- **Goal**: Add connect, disconnect, authenticate, clear-auth, and local/remote add-server flows with user-facing validation and error handling.
- **Priority entrypoints**:
  - `src/features/settings/SettingsMcpSection.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
  - matching locales/tests/docs
- **References**:
  - `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`
- **Constraints**:
  - Support add local/add remote only; do not build a full advanced editor for existing MCP entries.
  - Keep OAuth handling at the trigger/feedback layer, not a full protocol browser.
- **Acceptance**:
  - Users can add local/remote MCP servers and run the supported MCP actions from settings.
  - Tests cover validation, button visibility, and post-action refresh behavior.

### [NEXT] M3 - Stabilize MCP tool identity across history and streaming

- **Lane**: Tool-call rendering consistency
- **Goal**: Make known MCP tool names render as MCP consistently across hydrate, streaming, and completed-tool states without changing builtin/custom behavior.
- **Priority entrypoints**:
  - `src/shared/toolIdentity.ts`
  - `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `src/utils/streaming/ToolCallRenderer.ts`
  - matching tests/docs
- **References**:
  - `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`
- **Constraints**:
  - Reuse the existing tool renderer and MCP icon/summary rules.
  - Do not expand into MCP resources or prompts.
  - If deploy-relevant settings/runtime paths change, complete Test Vault deployment verification in this round.
- **Acceptance**:
  - MCP tools render as `mcp` consistently in history and streaming.
  - Tests cover classification drift and renderer stability.
  - The lane ends with docs synced and deploy verified where required.

## Lane state

- When this roadmap has no remaining `[NEXT]` or `[QUEUED]` items, the controller switches to `a3-formatter-settings`.
