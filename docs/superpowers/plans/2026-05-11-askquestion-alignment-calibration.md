# AskQuestion Alignment Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calibrate the AskQuestion alignment report against current source and fix the confirmed dock waiter clear hang.

**Architecture:** Keep the report as the source-backed roadmap, keep question runtime ownership in existing owners, and make only one code behavior change: `QuestionDockCoordinator` resolves pending dock waiters before dropping pending-question runtime state. Do not add new service files or broaden into keyboard navigation or protocol fallback.

**Tech Stack:** TypeScript, Jest, Obsidian plugin DOM helpers, repo module-doc guard, graphify source graph.

---

## File Structure

- Modify: `docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md`
  - Responsibility: source-backed status report and calibrated roadmap for AskQuestion alignment.
- Modify: `src/features/chat/services/QuestionDockCoordinator.ts`
  - Responsibility: above-input question dock pending request lifecycle, waiter queue, draft/selection state, and pending writeback.
- Modify: `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - Responsibility: focused regression coverage for dock pending lifecycle and waiter cleanup.
- Modify: `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - Responsibility: module-level owner documentation for `QuestionDockCoordinator`.
- Modify: `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json`
  - Responsibility: generated `src` graph artifacts refreshed after TypeScript source changes.

## Task 1: Calibrate AskQuestion Status Report

**Files:**
- Modify: `docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md`

- [ ] **Step 1: Inspect current factual anchors**

Run:

```bash
rg -n "QuestionDockSlotCoordinator|QuestionDockCoordinator|clearPendingQuestionState|POST /question/ask|awaitAnswers|question\\.ask|question\\.list|question\\.reply|question\\.reject" docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md src/features/chat/services/QuestionDockCoordinator.ts /Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/server/routes/instance/httpapi/groups/question.ts /Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts
```

Expected:
- Report still contains old or over-broad claims.
- `src/features/chat/services/QuestionDockCoordinator.ts` contains `clearPendingQuestionState()`.
- Local OpenCode SDK/server route files expose `question.list`, `question.reply`, and `question.reject`.
- Local OpenCode route files do not expose `question.ask`.

- [ ] **Step 2: Patch the owner and upstream-reference claims**

In `docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md`, make these exact content changes:

```markdown
**已确认 Bug：**

`QuestionDockCoordinator.clearPendingQuestionState()` 在 `questionRequestWaiters.clear()` 前不先 resolve waiters，导致 `waitForDockResolutionIfEnabled()` 的等待方可能无限挂起。
```

Replace any implementation-target language for `POST /question/ask` and `awaitAnswers` with:

```markdown
**当前校准（2026-05-11 源码复核）：** 本地 OpenCode 参考实现当前公开 `GET /question`、`POST /question/{requestID}/reply`、`POST /question/{requestID}/reject`，SDK 也只生成 `question.list()` / `question.reply()` / `question.reject()`。因此 `POST /question/ask` 与 `awaitAnswers` 不作为本轮 OpenCodian 修复目标；除非后续上游重新暴露该 route，否则仅保留为历史 PR 背景。
```

Where the roadmap lists P0/P1/P2, ensure this pass is described as:

```markdown
**本轮修复边界（已批准）：**

1. 校准本报告中不再符合当前源码的 owner / upstream route / 优先级表述。
2. 修复 `QuestionDockCoordinator.clearPendingQuestionState()` 的 waiter 释放 bug。
3. 更新聚焦单测与 `QuestionDockCoordinator` module doc。

键盘导航、tool-part fallback、question 数量上限归一化继续保留为后续计划项，本轮不实现。
```

- [ ] **Step 3: Verify no stale wrong owner remains**

Run:

```bash
rg -n "QuestionDockSlotCoordinator\\.clearPendingQuestionState|QuestionDockSlotCoordinator.*waiter|QuestionDockSlotCoordinator.*questionRequestWaiters|POST /question/ask.*P0|awaitAnswers.*P0|question.ask.*本轮" docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md
```

Expected: no output.

- [ ] **Step 4: Review report diff**

Run:

```bash
git diff -- docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md
```

Expected:
- Diff only changes report wording.
- No claim says `QuestionDockSlotCoordinator` owns `clearPendingQuestionState()`.
- No current implementation item asks OpenCodian to add absent upstream `question.ask` support.

## Task 2: Add Waiter-Clear Regression Test

**Files:**
- Modify: `tests/unit/features/chat/QuestionDockCoordinator.test.ts`

- [ ] **Step 1: Add a failing regression test**

In `tests/unit/features/chat/QuestionDockCoordinator.test.ts`, inside `describe('QuestionDockCoordinator resolution flow', () => {`, add this test after the existing test named `waits for above-input dock submission and runs the active-tab follow-up flow`:

```typescript
  it('resolves pending dock waiters when pending question state is cleared', async () => {
    const request = createQuestionRequest();
    const {
      coordinator,
      host,
      runtimeByTab,
    } = createCoordinator();

    const resolutionPromise = coordinator.waitForDockResolutionIfEnabled(
      request,
      'tab-active',
    );
    await Promise.resolve();

    const runtime = runtimeByTab.get('tab-active');
    expect(runtime).toBeDefined();
    expect(runtime?.pendingQuestionRequests).toEqual([request]);
    expect(runtime?.questionDraftAnswers.has(request.id)).toBe(true);
    expect(runtime?.questionActiveGroupKeys.has(request.id)).toBe(true);
    expect(runtime?.questionActiveIndexes.has(request.id)).toBe(true);
    expect(runtime?.questionRequestWaiters.has(request.id)).toBe(true);

    coordinator.clearPendingQuestionsForTab('tab-active');

    await expect(resolutionPromise).resolves.toBe(true);
    expect(runtime?.pendingQuestionRequests).toEqual([]);
    expect(runtime?.questionDraftAnswers.size).toBe(0);
    expect(runtime?.questionActiveGroupKeys.size).toBe(0);
    expect(runtime?.questionActiveIndexes.size).toBe(0);
    expect(runtime?.questionRequestWaiters.size).toBe(0);
    expect(host.replyToQuestion).not.toHaveBeenCalled();
    expect(host.rejectQuestion).not.toHaveBeenCalled();
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-active', false);
  });
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm test -- QuestionDockCoordinator --runInBand
```

Expected before implementation:
- Test run fails or hangs on `resolves.toBe(true)` for the new test.
- Existing tests may pass before the new failing assertion.

If the runner hangs, stop it with `Ctrl-C` and record that the new regression exposes the unresolved waiter bug.

## Task 3: Resolve Waiters Before Clearing Dock State

**Files:**
- Modify: `src/features/chat/services/QuestionDockCoordinator.ts`
- Test: `tests/unit/features/chat/QuestionDockCoordinator.test.ts`

- [ ] **Step 1: Implement the minimal waiter cleanup**

In `src/features/chat/services/QuestionDockCoordinator.ts`, replace `clearPendingQuestionState()` with:

```typescript
  private clearPendingQuestionState(runtime: QuestionDockRuntimeState): void {
    this.resolveAllQuestionWaiters(runtime);
    runtime.pendingQuestionRequests = [];
    runtime.resolvedQuestionRequestIds.clear();
    runtime.questionDraftAnswers.clear();
    runtime.questionActiveGroupKeys.clear();
    runtime.questionActiveIndexes.clear();
  }
```

Add this private method near `resolveRemovedQuestionWaiters()`:

```typescript
  private resolveAllQuestionWaiters(runtime: QuestionDockRuntimeState): void {
    for (const waiter of runtime.questionRequestWaiters.values()) {
      waiter.resolve();
    }

    runtime.questionRequestWaiters.clear();
  }
```

Do not add a reject path. Do not call `replyToQuestion()` or `rejectQuestion()` from cleanup.

- [ ] **Step 2: Run the focused test and confirm it passes**

Run:

```bash
npm test -- QuestionDockCoordinator --runInBand
```

Expected:
- `PASS tests/unit/features/chat/QuestionDockCoordinator.test.ts`
- The new test passes.

- [ ] **Step 3: Inspect for lint-sensitive issues**

Run:

```bash
npm run lint -- tests/unit/features/chat/QuestionDockCoordinator.test.ts src/features/chat/services/QuestionDockCoordinator.ts
```

Expected:
- `0 problems` or equivalent successful ESLint exit.

## Task 4: Update Module Documentation

**Files:**
- Modify: `docs/modules/features/chat/services/QuestionDockCoordinator.md`

- [ ] **Step 1: Patch the module doc behavior section**

In `docs/modules/features/chat/services/QuestionDockCoordinator.md`, add this bullet under the "关键行为" list:

```markdown
- `clearPendingQuestionsForTab()` 在丢弃 pending request / draft answer / active selection runtime state 前，会先 resolve 当前 tab 的所有 dock waiters，确保正在 `waitForDockResolutionIfEnabled()` 中等待上方 dock 的调用方不会因为清理路径永久挂起；该清理路径只释放本地等待，不会主动调用 OpenCode `reply` / `reject` API。
```

- [ ] **Step 2: Run module-doc guard**

Run:

```bash
npm run check:module-docs
```

Expected:
- `check:module-docs:coverage` passes.
- `check:module-docs:diff` passes for the current diff.

If unrelated pre-existing working-tree edits cause additional module-doc failures, do not edit unrelated files. Record the failing paths and continue with focused verification.

## Task 5: Refresh Graphify and Final Verification

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`

- [ ] **Step 1: Refresh source graph artifacts**

Run:

```bash
npm run graphify:update:src
```

Expected:
- Command exits 0.
- `graphify-out/GRAPH_REPORT.md` and/or `graphify-out/graph.json` may update.
- No transient `src/graphify-out/` remains in git status.

- [ ] **Step 2: Check graph freshness**

Run:

```bash
npm run check:graphify
```

Expected:
- Graph freshness check passes.

- [ ] **Step 3: Rerun focused verification**

Run:

```bash
npm test -- QuestionDockCoordinator --runInBand
npm run check:module-docs
npm run check:graphify
```

Expected:
- All three commands pass, unless `check:module-docs` is blocked only by unrelated pre-existing files. If blocked, list the unrelated paths exactly.

- [ ] **Step 4: Optional full verification**

Run if the working tree is suitable for full-suite verification:

```bash
npm run verify
```

Expected:
- Full verify passes.

If full verify fails because of unrelated existing changes, keep the focused evidence from Step 3 and record the full-verify blocker without changing unrelated files.

## Task 6: Commit the Implementation Slice

**Files:**
- Stage only files changed by this implementation slice:
  - `docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md`
  - `src/features/chat/services/QuestionDockCoordinator.ts`
  - `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  - `docs/modules/features/chat/services/QuestionDockCoordinator.md`
  - `graphify-out/GRAPH_REPORT.md`
  - `graphify-out/graph.json`

- [ ] **Step 1: Review scoped diff**

Run:

```bash
git diff -- docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md src/features/chat/services/QuestionDockCoordinator.ts tests/unit/features/chat/QuestionDockCoordinator.test.ts docs/modules/features/chat/services/QuestionDockCoordinator.md graphify-out/GRAPH_REPORT.md graphify-out/graph.json
```

Expected:
- Report calibration only changes status-report wording.
- Source change only resolves waiters before clearing question runtime state.
- Test change only adds the waiter-clear regression.
- Module doc change documents the new cleanup behavior.
- Graphify changes are generated.

- [ ] **Step 2: Stage only scoped files**

Run:

```bash
git add docs/status/askquestion-mechanism-alignment-evaluation-2026-05-11.md src/features/chat/services/QuestionDockCoordinator.ts tests/unit/features/chat/QuestionDockCoordinator.test.ts docs/modules/features/chat/services/QuestionDockCoordinator.md graphify-out/GRAPH_REPORT.md graphify-out/graph.json
```

Expected:
- Only the listed files are staged for this slice.
- Pre-existing unrelated working-tree files remain unstaged.

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "fix: release pending question dock waiters"
```

Expected:
- Commit succeeds.
- Commit contains the calibrated report, waiter fix, regression test, module doc, and graphify artifacts.
