# Autopilot Round Roadmap — `a1-agent-surface`

## Queue

### [NEXT] A1 - Establish agent surface core seams and catalog truth

- **Lane**: Agent surface foundations
- **Goal**: Introduce the core `src/core/agents` types/services and make runtime/config/file agent aggregation a first-class, testable seam without inventing plugin-private agent semantics.
- **Priority entrypoints**:
  - `src/core/agents/types.ts`
  - `src/core/agents/AgentCatalogService.ts`
  - `src/core/agents/SystemAgentGuardService.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/config/OpencodeConfigManager.ts`
  - `src/core/types/opencodeConfig.ts`
  - matching `tests/unit/core/`
  - matching `docs/modules/**`
- **References**:
  - `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- **Constraints**:
  - Keep the slice bounded to catalog/state seams, system-agent guard data, and supporting types.
  - No chat UI wiring or Markdown CRUD yet.
  - No fake merging of runtime/config/file truth states.
- **Acceptance**:
  - The new seams can represent builtin, builtin+override, config-only, markdown-only, and system agents.
  - Tests cover catalog/source classification and default eligibility.
  - Matching module docs are updated for every touched module.

### [QUEUED] A2 - Wire explicit agent invocation into chat send paths

- **Lane**: Chat invocation
- **Goal**: Wire main-agent selection, `@subagent`, and subtask intent through the existing chat send path and OpenCode invocation owners without ad-hoc fallback behavior.
- **Priority entrypoints**:
  - `src/core/agents/AgentInvocationService.ts`
  - `src/features/chat/services/MessageSendPreparationService.ts`
  - `src/core/opencode/OpenCodePromptRequestBuilder.ts`
  - `src/features/chat/OpenCodianView.ts`
  - `src/core/types/chat.ts`
  - matching tests/docs
- **References**:
  - `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- **Constraints**:
  - Preserve current chat behavior outside the new explicit agent surfaces.
  - Keep request failure handling native and visible; no silent fallback to plain prompts.
- **Acceptance**:
  - Chat can explicitly choose a main agent and route `@subagent` / subtask intent through native request parts.
  - Tests cover prompt mapping and reject paths.

### [QUEUED] A3 - Restore child-session graph tracking and session-tree UI

- **Lane**: Child session graph
- **Goal**: Reconstruct task -> child-session relationships from metadata, persisted parts, and `session.children()` so the active conversation can surface a stable child-session tree.
- **Priority entrypoints**:
  - `src/core/agents/ChildSessionGraphService.ts`
  - `src/features/chat/OpenCodianView.ts`
  - adjacent chat runtime helpers around conversation hydration/rendering
  - matching tests/docs
- **References**:
  - `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- **Constraints**:
  - Preserve current hydration guards and concurrent-tab runtime behavior.
  - Keep degraded `partial graph` handling explicit when metadata is incomplete.
- **Acceptance**:
  - The active session can restore and navigate child-session edges.
  - Tests cover task-edge recovery and partial-graph fallback.

### [QUEUED] A4 - Finish Agent Studio management surfaces

- **Lane**: Settings and file workspace
- **Goal**: Complete project-config agent management, Markdown agent CRUD/sync state, and system-agent expert override surfaces without bloating settings owners.
- **Priority entrypoints**:
  - `src/core/agents/MarkdownAgentWorkspaceService.ts`
  - `src/features/settings/SettingsAgentsSection.ts`
  - `src/features/settings/SettingsProjectAgentEditor.ts`
  - `src/features/settings/SettingsCommandsSection.ts`
  - locale files and matching docs/tests
- **References**:
  - `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
  - `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- **Constraints**:
  - Expert mode gates system overrides.
  - File write state and runtime visibility must remain separate statuses.
  - If deploy-relevant settings paths change, complete Test Vault deployment verification in this round.
- **Acceptance**:
  - Project config agents, Markdown agents, and system-agent overrides are manageable from the intended surfaces.
  - Sync/pending/error states are visible and tested.
  - The lane ends with docs synced and deploy verified where required.

## Lane state

- When this roadmap has no remaining `[NEXT]` or `[QUEUED]` items, the controller switches to `a2-mcp-settings`.
