# Autopilot Phase 3 — `a2-mcp-settings`

## Round Design

- **Queued slice**: `[NEXT] M3 - Stabilize MCP tool identity across history and streaming`
- **Active spec**: `docs/superpowers/specs/2026-04-25-opencodian-mcp-settings-and-tooling-design.md`
- **External reference**: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode-mcp-servers-doc.md`
- **Targeted files/modules**:
  - `src/shared/toolIdentity.ts`
  - `src/core/opencode/OpenCodeCatalogStateStore.ts` only if the existing identity context needs a minimal truth-state repair for known MCP names
  - `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `src/utils/streaming/ToolCallRenderer.ts` only if the current structured `kind` handoff still allows MCP icon/summary drift in completed states
  - focused tests under `tests/unit/shared/`, `tests/unit/core/opencode/`, and `tests/unit/utils/streaming/`
  - matching module docs under `docs/modules/shared/`, `docs/modules/core/opencode/`, and `docs/modules/utils/streaming/`
- **Upstream/runtime contract to confirm**:
  - Keep builtin/custom/task/question/skill behavior unchanged; this slice only stabilizes when OpenCode MCP tool names become `mcp`.
  - Keep MCP identity flowing through the existing shared tool-identity seam so hydrate and streaming do not fork separate MCP heuristics.
  - Preserve the current `registryTools` versus external-tool distinction: registry-backed tools still render as `custom`, while known MCP tool names render as `mcp`.
  - Ensure a streamed MCP tool can be observed early enough that the first emitted `tool_use` chunk and later completed state do not drift between `custom`/`unknown` and `mcp`.
  - Reuse the current renderer, MCP icon, and `mcpSummaryConfig` summary rules instead of inventing a new MCP card path.
- **Targeted tests to run**:
  - focused Jest for `tests/unit/shared/toolIdentity.test.ts`
  - focused Jest for `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`
  - focused Jest for `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
  - focused Jest for `tests/unit/core/opencode/OpenCodeStreamEventTransformer.streamPartHandlingSuite.ts`
  - focused Jest for `tests/unit/utils/streaming/ToolCallRenderer.test.ts` if renderer behavior or regressions need direct coverage
  - `npm run check:module-docs` if module docs change
  - `npm run verify`
- **Deploy-required paths likely touched**: `No`. The queued M3 slice should stay in shared/core/streaming owners plus docs/tests, outside the repo’s deploy-required settings/theme/runtime paths.
- **Non-goals / boundaries**:
  - no new MCP settings UI, resources UI, prompts UI, or OAuth/editor work
  - no formatter-lane work
  - no direct server / SDK protocol changes
  - no unrelated stream/render refactors beyond the minimal MCP identity stability fix

## Design Review Result

- **Verdict**: `PASS`
- **Why this design is ready**:
  - The queued M3 scope is already narrow in the roadmap/spec: stabilize MCP `toolKind` identity, not the MCP settings UI. The codebase already has the required owners (`toolIdentity`, mapper, stream transformer, renderer), so the slice can stay bounded.
  - The current seams show a concrete likely drift point: `OpenCodeStreamEventTransformer` classifies a streamed tool part before it writes the new tool name back into the runtime catalog context. That makes it plausible for a first-seen OpenCode MCP tool to render with a non-`mcp` kind on the first chunk and only become `mcp` later.
  - `OpenCodeMessageNormalizationMapper` already centralizes hydrated tool-kind resolution through the shared identity helper and catalog context, so the safest repair is to keep that same shared rule and make the stream path consume it at the right time rather than inventing a second MCP classifier.
  - `ToolCallRenderer` already respects structured `toolCall.kind === 'mcp'` for icon/summary behavior, so the slice should prefer upstream kind stabilization over renderer-local heuristics. Renderer edits are only justified if a completed-state regression still survives once structured kind is stable.
- **Risks watched during implementation**:
  - do not regress registry-backed OpenCode custom tools into `mcp`
  - do not let first-seen streaming tool parts emit a non-`mcp` kind and then drift later for the same call
  - do not broaden MCP detection into resources/prompts or change builtin/task rendering semantics

## Implementation Summary

- Fixed MCP tool identity drift in `OpenCodeStreamEventTransformer` by moving `observeRuntimeToolNames` before classification in both `handleToolPartUpdated` and `appendToolPartChunks`, ensuring first-seen MCP tools emit `mcp` kind on the first `tool_use` chunk rather than starting as `custom` and drifting to `mcp` on subsequent events.
- Added regression tests covering first-seen MCP classification, lifecycle stability (running→completed), and registry tool priority preservation.
- Added `toolIdentity` tests for registry-over-observed priority and known-MCP / observed-external classification paths.
- Updated module doc for `OpenCodeStreamEventTransformer` to document the observe-before-classify ordering constraint.
- Removed one inline code comment from `OpenCodeStreamEventTransformer.ts` during Codex review so the final patch stays aligned with repo instruction style.

## Files Changed

- `src/core/opencode/OpenCodeStreamEventTransformer.ts` — moved `observeRuntimeToolNames` before `resolveToolPartClassification` in `handleToolPartUpdated`; added `observeRuntimeToolNames` before classification in `appendToolPartChunks`
- `tests/unit/core/opencode/OpenCodeStreamEventTransformer.streamPartHandlingSuite.ts` — added 3 MCP identity stability tests
- `tests/unit/shared/toolIdentity.test.ts` — added 3 priority/classification tests
- `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md` — documented observe-before-classify constraint
- `docs/status/lanes/a2-mcp-settings/autopilot-round-roadmap.md` — advanced the lane queue after M3 completion
- `docs/status/lanes/a2-mcp-settings/autopilot-phase-3.md` — recorded design, review, validation, and round outcome

## Validation

- `npm test -- --runInBand --runTestsByPath tests/unit/shared/toolIdentity.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.streamPartHandlingSuite.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts tests/unit/utils/streaming/ToolCallRenderer.test.ts` — PASS (`4` suites / `78` tests)
- `npm run check:module-docs` — PASS (coverage + diff)
- `npm run verify` — PASS (lint, typecheck, 332 test suites / 1625 tests, build)
- Extracted `BUILD_ID`: `autopilot-agent-mcp-formatter-review-loop.202604251726`
- Deploy-relevant paths not touched; no Test Vault deployment required.

## Code Review Result

- **Verdict**: `PASS`
- **Why the slice passes review**:
  - The fix stays inside queued M3 scope and resolves a concrete MCP drift root cause instead of adding new MCP heuristics or UI paths.
  - Registry-backed tools still remain `custom`, and the new regression coverage explicitly guards that precedence.
  - The existing renderer path remains intact; structured `mcp` kind now arrives early enough for stable icon/summary behavior without renderer-local workarounds.
  - Focused tests, module-doc guard, and the full `npm run verify` gate all passed cleanly, and no deploy-trigger paths were touched.

## Outcome

- MCP tools render as `mcp` consistently across history hydration and streaming, with no classification drift between first emission and completion.
- Registry-backed tools remain `custom`; builtin/task/question/skill behavior unchanged.
- Tests cover classification drift prevention and renderer stability.

## Next Recommended Slice

- This was the final slice in the `a2-mcp-settings` lane. The controller should switch to `a3-formatter-settings`.
