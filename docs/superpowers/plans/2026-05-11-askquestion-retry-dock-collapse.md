# AskQuestion Retry And Dock Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add narrow transient retry for AskQuestion reply/reject and local collapse state for the above-input QuestionDock.

**Architecture:** Keep both changes inside existing owners. `OpenCodeQuestionPermissionHub` owns retry around question mutations without changing its public API; `QuestionDock` owns request-keyed collapse UI state without settings or coordinator changes.

**Tech Stack:** TypeScript, Jest, Obsidian DOM helpers, CSS, Markdown module docs, graphify.

---

### Task 1: Reply/Reject Transient Retry Tests

**Files:**
- Modify: `tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts`

- [ ] **Step 1: Write failing reply retry test**

Add a question negotiation test where legacy `postLegacy('/question/question-1/reply')` rejects once with a transient status and then resolves. Disable SDK questions with `shouldUseSdkQuestions: jest.fn(() => false)`. Expect `replyToQuestion()` to resolve and `postLegacy` to be called twice with the same path/body.

- [ ] **Step 2: Write failing reject retry test**

Add a matching test for `rejectQuestion('question-1')` where legacy reject fails once with `{ status: 503 }` and succeeds on the second call. Expect two calls with `/question/question-1/reject` and `{}`.

- [ ] **Step 3: Write persistent failure test**

Add a test where reply fails three times with transient errors. Capture the third error object and assert `replyToQuestion()` rejects with that exact error and `postLegacy` is called three times.

- [ ] **Step 4: Run RED**

Run:

```bash
npm test -- OpenCodeQuestionPermissionHub --runInBand
```

Expected before implementation: the new retry-success tests fail because mutation attempts only run once, and the persistent-failure call count assertion fails.

### Task 2: Minimal Retry Implementation

**Files:**
- Modify: `src/core/opencode/OpenCodeQuestionPermissionHub.ts`

- [ ] **Step 1: Add retry helpers inside the hub module**

Add a `QUESTION_MUTATION_MAX_RETRIES = 2` constant, an `isTransientQuestionMutationError(error)` helper, and a `runQuestionMutationWithRetry(operation)` helper. The helper must throw the final caught error unchanged and must not retry non-transient failures.

- [ ] **Step 2: Wrap only question reply/reject mutations**

Wrap `getSdkQuestion().reply`, `getSdkQuestion().reject`, and legacy `postLegacy()` calls used by `replyToQuestion()` / `rejectQuestion()`. Do not wrap `question.list()` or permission methods.

- [ ] **Step 3: Run GREEN**

Run:

```bash
npm test -- OpenCodeQuestionPermissionHub --runInBand
```

Expected: all hub tests pass.

### Task 3: QuestionDock Collapse Tests

**Files:**
- Modify: `tests/unit/features/chat/QuestionDock.test.ts`

- [ ] **Step 1: Write failing collapse test**

Render the dock, click `.opencodian-question-dock-collapse-toggle`, and assert the root has `is-collapsed`, `aria-expanded="false"`, the body and footer are absent, and header progress/summary text remains visible.

- [ ] **Step 2: Write failing expand restore test**

Click the same toggle again and assert `aria-expanded="true"`, the body and footer return, and the previously selected draft answer is still checked when `render()` receives the same `answers` array.

- [ ] **Step 3: Write failing new-request default-expanded test**

Collapse `request-1`, then render a new request with id `request-2`. Assert the root is expanded and the body/footer are present.

- [ ] **Step 4: Run RED**

Run:

```bash
npm test -- QuestionDock --runInBand
```

Expected before implementation: toggle selectors are missing and collapse assertions fail.

### Task 4: Minimal Dock Collapse Implementation

**Files:**
- Modify: `src/features/chat/ui/QuestionDock.ts`
- Modify: `src/style/base/core.css`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`

- [ ] **Step 1: Add local request-keyed state**

Add private fields for `currentRequestId` and `collapsedRequestIds`. In `render()`, when the request id changes, default the new request to expanded by deleting it from the collapsed set.

- [ ] **Step 2: Add header toggle**

Add a header button before close with class `opencodian-question-dock-collapse-toggle`, `aria-expanded`, localized label, and `chevron-up` / `chevron-down` icon. Clicking it toggles the active request id and rerenders from the last state/callbacks.

- [ ] **Step 3: Hide body/footer while collapsed**

When collapsed, add root class `is-collapsed`, render header only, and skip tabs/body/footer. Keep the existing close button.

- [ ] **Step 4: Add small CSS affordance**

Style `.opencodian-question-dock-collapse-toggle` consistently with the existing close button and add minimal `.is-collapsed` spacing rules if needed. Do not redesign the panel.

- [ ] **Step 5: Run GREEN**

Run:

```bash
npm test -- QuestionDock --runInBand
```

Expected: all Dock tests pass.

### Task 5: Docs, Graphify, Verification, Commit

**Files:**
- Modify: `docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md`
- Modify: `docs/modules/features/chat/ui/QuestionDock.md`
- Generated/modify as needed: `graphify-out/**`

- [ ] **Step 1: Update module docs**

Document that question reply/reject retry only covers transient request failures and that final errors still propagate. Document Dock collapse as above-input, component-local, request-keyed state.

- [ ] **Step 2: Run focused acceptance**

```bash
npm test -- OpenCodeQuestionPermissionHub --runInBand
npm test -- QuestionDock --runInBand
npm run check:module-docs
```

- [ ] **Step 3: Refresh and check graphify**

```bash
npm run graphify:update:src
npm run check:graphify
```

- [ ] **Step 4: Run final verification**

```bash
npm run verify
```

- [ ] **Step 5: Commit implementation**

```bash
git add src/core/opencode/OpenCodeQuestionPermissionHub.ts tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts src/features/chat/ui/QuestionDock.ts tests/unit/features/chat/QuestionDock.test.ts src/style/base/core.css src/i18n/locales/en.ts src/i18n/locales/zh.ts docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md docs/modules/features/chat/ui/QuestionDock.md graphify-out
git commit -m "feat: polish askquestion retry and dock collapse"
```
