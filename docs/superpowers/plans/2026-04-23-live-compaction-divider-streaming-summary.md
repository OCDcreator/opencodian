# Live Compaction Divider + Streaming Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-chat live compaction divider plus streaming compaction-summary rendering so users can see auto-compaction begin and progress before final transcript reload.

**Architecture:** Introduce a dedicated compaction render model instead of flattening compaction into plain user markdown. Reuse that model for both live `compactingAt` state and persisted transcript artifacts, while opening a narrow render path that lets assistant `summary: true` messages grow live only for compaction.

**Tech Stack:** TypeScript, Obsidian view runtime, existing chat render pipeline, Jest, repo module-doc workflow

---

### Task 1: Add failing coverage for live compaction UX

**Files:**
- Modify: `tests/unit/core/opencode/OpenCodeMessageNormalizationMapper.test.ts`
- Modify: `tests/unit/features/chat/services/ConversationRenderRuntime.test.ts`
- Modify: `tests/unit/features/chat/services/ConversationSyncBridge.test.ts`
- Modify: `tests/unit/features/chat/OpenCodianView.test.ts`

- [ ] Add a failing mapper test that expects user `compaction` parts to survive normalization as structured compaction UI data instead of plain text-only user content.
- [ ] Add a failing render-runtime test that expects compaction summaries to bypass merge but still render through a live-update path instead of the current “wait until final persisted message” behavior.
- [ ] Add a failing sync-bridge test that expects `session.compacted` reload to preserve the compaction UI boundary instead of visually flashing back to ordinary text.
- [ ] Add a failing view test that expects the live divider to appear while a tab is compacting and to remain bound to the owning tab when another tab becomes active.

### Task 2: Introduce the compaction render model

**Files:**
- Modify: `src/core/types/chat.ts`
- Modify: `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
- Modify: `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`

- [ ] Extend the chat view model with explicit compaction metadata instead of relying on flattened content text alone.
- [ ] Stop downgrading user `compaction` parts to plain rendered markdown text; map them into the new compaction render model.
- [ ] Keep `compaction_continue` synthetic user follow-ups hidden.
- [ ] Re-run the targeted mapper tests and confirm transcript compaction artifacts now project into structured UI state.

### Task 3: Render the live and persisted divider with one visual style

**Files:**
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/style/**/*.css` or the owning chat style source
- Modify: `src/i18n/locales/zh.ts`
- Modify: `src/i18n/locales/en.ts`

- [ ] Add the lightweight divider shell: thin side rules + centered pill label, with distinct live/completed states.
- [ ] Render persisted compaction markers with the same visual component instead of ordinary user-message markdown.
- [ ] Add the live label copy (`正在压缩上下文` / completed-state copy) and any minimal helper strings needed for accessibility.
- [ ] Re-run the focused view/style tests and verify the divider appears in the right place without turning into a heavy notice card.

### Task 4: Bridge `compactingAt` into the owning tab runtime

**Files:**
- Modify: `src/features/chat/services/ContextUsageService.ts`
- Modify: `src/features/chat/services/ContextUsageDisplayService.ts`
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/features/chat/services/ConversationSyncBridge.ts`

- [ ] Keep `compactingAt` flowing to the existing context-usage UI, but also surface it into the chat-render runtime for the owning conversation tab.
- [ ] Ensure switching tabs does not move the divider into another conversation; the original tab keeps its live compaction state and resumes correctly when revisited.
- [ ] Keep the existing close-tab busy guard effective while compaction/summary live rendering is in progress.
- [ ] Re-run the sync/tab-behavior tests and confirm switch/close semantics match the approved UX.

### Task 5: Make compaction summaries visibly grow live

**Files:**
- Modify: `src/features/chat/services/ConversationRenderRuntime.ts`
- Modify: `src/features/chat/renderGroups.ts`
- Modify: `src/features/chat/OpenCodianView.ts`

- [ ] Carve out a narrow live-render path for compaction summaries so `summary: true` messages can grow while remaining separate from normal merged assistant output.
- [ ] Preserve the existing non-merge rule for summary messages.
- [ ] Keep other summary-like / notice-like messages on their current rendering behavior unless they are explicit compaction summaries.
- [ ] Re-run targeted render-runtime tests and verify compaction summaries now show progressive growth under the divider.

### Task 6: Stabilize post-compaction reload and docs

**Files:**
- Modify: `src/features/chat/services/ConversationSyncBridge.ts`
- Modify: `docs/modules/features/chat/OpenCodianView.md`
- Modify: `docs/modules/features/chat/services/ConversationRenderRuntime.md`
- Modify: `docs/modules/features/chat/renderGroups.md`
- Modify: `docs/modules/core/opencode/OpenCodeMessageNormalizationMapper.md`
- Modify: `docs/modules/core/opencode/OpenCodeMessageContextOmoAssembler.md`

- [ ] Make sure `session.compacted` still forces authoritative correctness without visually erasing the just-rendered compaction boundary.
- [ ] Update module docs to explain the new live-divider, persisted-divider, and compaction-summary responsibilities.
- [ ] Run targeted Jest for all compaction-related additions.
- [ ] Run `npm run verify`.
