# Autopilot Phase 2 — `a1-agent-surface`

## Round Design

- **Queued slice**: `[NEXT] A2 - Wire explicit agent invocation into chat send paths`
- **Active spec**: `docs/superpowers/specs/2026-04-25-opencode-agent-surface-design.md`
- **External reference**: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-agent-mechanism-and-sdk.md`
- **Targeted files/modules**:
  - `src/core/agents/AgentInvocationService.ts`
  - `src/core/agents/index.ts`
  - `src/core/opencode/OpenCodePromptRequestBuilder.ts`
  - `src/core/opencode/OpenCodeService.ts` only if a public structured-payload seam is needed for stable part IDs
  - `src/core/types/chat.ts`
  - `src/features/chat/services/MessageSendPreparationService.ts`
  - `src/features/chat/runtime/SendPipelineRuntime.ts` / `src/features/chat/runtime/SendPipelineTypes.ts` only if the prompt-send contract must carry explicit invocation intent through the existing pipeline
  - `src/features/chat/OpenCodianView.ts`
  - matching `tests/unit/core/agents/`, `tests/unit/core/opencode/`, `tests/unit/features/chat/`, and matching `docs/modules/**`
- **Upstream/runtime contract to confirm**:
  - `session.prompt()` uses an explicit top-level `agent` field for the main agent, otherwise the backend falls back to `default_agent` / first visible non-subagent agent.
  - `AgentPartInput` is the native way to explicitly mention a subagent in prompt parts; it is not a separate RPC.
  - `SubtaskPartInput` is the native way to push explicit subtask intent and must stay distinct from plain text or synthetic fallback prompts.
  - Runtime-visible failures for invalid agent / subagent / subtask combinations must stay native and visible; the plugin must not silently degrade the request to a plain prompt.
- **Targeted tests to run**:
  - focused Jest for `AgentInvocationService`, `OpenCodePromptRequestBuilder`, `MessageSendPreparationService`, and any touched send-pipeline/view seams
  - `npm run check:module-docs` when touched module docs change
  - `npm run verify`
- **Deploy-required paths likely touched**: `No` — the slice should stay in core/chat runtime send-path owners and avoid `src/main.ts`, `manifest.json`, `styles.css`, `assets/`, `src/style/`, `src/core/theme/`, and `src/features/settings/`.
- **Non-goals / boundaries**:
  - no child-session graph reconstruction or session-tree UI (A3)
  - no Markdown agent CRUD, Agent Studio management, or expert-mode system override surfaces (A4)
  - no MCP or formatter lane work
  - no plugin-private fallback syntax or fake-success request rewriting
  - keep chat behavior unchanged when no explicit agent invocation intent is provided

## Design Review Result

- **Verdict**: `PASS`
- **Why this design is ready**:
  - The active spec and reference both center A2 on transport truth: explicit main-agent selection must map to prompt-level `agent`, while `@subagent` and subtasks must map to native request parts instead of synthetic plain-text fallback.
  - The repo already has the right seam split for a bounded slice: `MessageSendPreparationService` owns optimistic send bootstrap, `OpenCodePromptRequestBuilder` owns stable prompt-part cloning/ID assignment, and `OpenCodianView` only needs to forward whatever explicit invocation contract the chat runtime emits.
  - A dedicated `AgentInvocationService` can centralize prompt-intent normalization/mapping without regrowing `OpenCodianView.ts` or `OpenCodeService.ts` with new runtime ownership.
  - The reference docs make runtime behavior explicit enough to review against: top-level main `agent`, native `agent` parts for subagent mentions, native `subtask` parts for explicit subtasks, and no silent fallback when the runtime rejects a request.
- **Risks watched during implementation**:
  - explicit subagent/subtask intent stays structured instead of being flattened into helper text
  - stable prompt/message IDs now cover the new `agent` / `subtask` part kinds
  - the no-intent path still uses the unchanged plain-string send bridge
  - the only public `OpenCodeService` widening is the structured-payload helper for `invocationParts`

## Implementation Summary

- OpenCode pass 1 introduced the new invocation seam and part variants, but stalled before the reachable chat wiring, tests, and docs were complete.
- OpenCode pass 2 widened the transport seam further, but also stalled before finishing review gates.
- I completed the slice locally by wiring prompt submissions through `SendPipelineRuntime` as structured `PrepareMessageSendOptions`, letting `OpenCodianView` forward optional `syntheticTextParts` and `invocationIntent` while keeping command/shell behavior unchanged.
- `AgentInvocationService` now resolves prompt-only explicit main-agent, `@subagent`, and subtask intent into native OpenCode structures with trimmed fields and malformed entry filtering.
- `OpenCodePromptRequestBuilder` and `OpenCodeService` now preserve stable IDs and canonical optimistic-part cloning for `agent` / `subtask` request parts in the same send payload as normal text/file parts.

## Files Changed

- **Core agent seam**:
  - `src/core/agents/AgentInvocationService.ts`
  - `src/core/agents/index.ts`
  - `src/core/agents/types.ts`
- **Prompt transport / send pipeline**:
  - `src/core/opencode/OpenCodePromptRequestBuilder.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/features/chat/services/MessageSendPreparationService.ts`
  - `src/features/chat/runtime/SendPipelineRuntime.ts`
  - `src/features/chat/runtime/SendPipelineTypes.ts`
  - `src/features/chat/OpenCodianView.ts`
- **Tests**:
  - `tests/unit/core/agents/AgentInvocationService.test.ts`
  - `tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts`
  - `tests/unit/features/chat/MessageSendPreparationService.test.ts`
  - `tests/unit/features/chat/MessageSendPreparationService.agentInvocation.test.ts`
  - `tests/unit/features/chat/SendPipelineRuntime.test.ts`
  - `tests/unit/features/chat/SendPipelineRuntime.agentInvocation.test.ts`
- **Module docs**:
  - `docs/modules/core/agents/AgentInvocationService.md`
  - `docs/modules/core/agents/index.md`
  - `docs/modules/core/agents/types.md`
  - `docs/modules/core/opencode/OpenCodePromptRequestBuilder.md`
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/features/chat/services/MessageSendPreparationService.md`
  - `docs/modules/features/chat/runtime/SendPipelineRuntime.md`
  - `docs/modules/features/chat/runtime/SendPipelineTypes.md`
  - `docs/modules/features/chat/OpenCodianView.md`

## Validation

- Focused Jest: `npm test -- --runInBand --runTestsByPath tests/unit/core/agents/AgentInvocationService.test.ts tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/features/chat/MessageSendPreparationService.test.ts tests/unit/features/chat/MessageSendPreparationService.agentInvocation.test.ts tests/unit/features/chat/SendPipelineRuntime.test.ts tests/unit/features/chat/SendPipelineRuntime.agentInvocation.test.ts`
  - `6` suites / `26` tests passed
- `npm run check:module-docs`
  - coverage OK (`360` source modules / `360` mapped docs)
  - diff OK (`8` required doc targets)
- `npm run verify`
  - lint: green
  - typecheck: green
  - full Jest: `326` suites / `1544` tests passed
  - build: green
  - extracted `BUILD_ID`: `autopilot-agent-mcp-formatter-review-loop.202604250855`
- Deploy verification: not required; this slice did not touch deploy-required paths.

## Code Review Result

- **Verdict**: `PASS`
- **Why the slice passes review**:
  - The existing chat send path can now carry structured explicit invocation intent from prompt submission -> preparation -> transport without inventing plugin-private fallback syntax.
  - Main-agent selection stays a native top-level `agent`, while `@subagent` and subtask intent stay native request parts with stable IDs through optimistic seeding and transport.
  - The no-intent path remains behavior-preserving because string sends still flow through the unchanged branch and the full suite stayed green.
  - The round stayed inside `[NEXT] A2`; it did not start child-session graph work, settings/file CRUD, MCP work, or formatter work.

## Outcome

- A2 is complete and verified. The chat send pipeline now has a bounded explicit-agent invocation seam that preserves native OpenCode agent/subtask semantics, ships with focused regression coverage, and keeps module docs aligned.

## Next Recommended Slice

- `[NEXT] A3 - Restore child-session graph tracking and session-tree UI`
