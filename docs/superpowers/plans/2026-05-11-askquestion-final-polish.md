# AskQuestion Final Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the final AskQuestion report with Council review and add regression tests proving Dock and Inline `Enter` auto-advance behavior for non-final sequential single-select questions.

**Architecture:** This is a test-and-documentation polish. Existing Dock and Inline keyboard owners should remain unchanged unless the new tests expose a real behavior gap.

**Tech Stack:** TypeScript, Jest, Markdown docs.

---

### Task 1: Dock Enter Auto-Advance Coverage

**Files:**
- Modify: `tests/unit/features/chat/QuestionDock.test.ts`

- [ ] **Step 1: Add failing test**

Add a test that renders a two-question single-mode request, focuses a radio in the first question, sends `Enter`, and expects `onAnswerChange(0, ['Python'])`, `onSelectQuestion(1)`, and no submit.

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- QuestionDock --runInBand
```

Expected: if the behavior is already present, the test may pass immediately. In that case, treat this as regression proof for existing behavior and do not change production code.

### Task 2: Inline Enter Auto-Advance Coverage

**Files:**
- Modify: `tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`

- [ ] **Step 1: Add failing test**

Add a test that renders a two-question sequential single-select inline request, focuses a first-question option, sends `Enter`, waits for render flush, and expects the card to show the second question while the response promise remains pending.

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- QuestionInlineCardRenderer --runInBand
```

Expected: if the behavior is already present, the test may pass immediately. In that case, treat this as regression proof for existing behavior and do not change production code.

### Task 3: Council Report And Module Docs

**Files:**
- Modify: `docs/archive/maintainability/phases/askquestion-mechanism-alignment-evaluation-2026-05-11.md`
- Modify: `docs/modules/features/chat/ui/QuestionDock.md`
- Modify: `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`

- [ ] **Step 1: Update final report**

Change final score to `8.8/10`, add Council approval summary, and state defects remaining are 0.

- [ ] **Step 2: Update keyboard docs**

Clarify that sequential non-final single-select options auto-advance through both `Space` and `Enter`, while final submission remains explicit.

### Task 4: Verify And Commit

- [ ] **Step 1: Run focused tests**

```bash
npm test -- QuestionDock --runInBand
npm test -- QuestionInlineCardRenderer --runInBand
npm run check:module-docs
```

- [ ] **Step 2: Run full verification**

```bash
npm run verify
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-11-askquestion-final-polish-design.md docs/superpowers/plans/2026-05-11-askquestion-final-polish.md tests/unit/features/chat/QuestionDock.test.ts tests/unit/features/chat/QuestionInlineCardRenderer.test.ts docs/archive/maintainability/phases/askquestion-mechanism-alignment-evaluation-2026-05-11.md docs/modules/features/chat/ui/QuestionDock.md docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md
git commit -m "test: document askquestion final polish"
```
