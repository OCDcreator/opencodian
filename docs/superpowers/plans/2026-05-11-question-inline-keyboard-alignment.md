# Question Inline Keyboard Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard operation to inline AskQuestion cards without changing the above-input dock or protocol behavior.

**Architecture:** Keep inline keyboard handling inside `QuestionInlineCardRenderer.ts`, because that renderer owns inline card DOM, per-question input state, answer collection, and Promise resolution. Extend the existing focused renderer test file first, then add small private methods that reuse `QuestionInputState` and `collectAnswerFromInputState()`.

**Tech Stack:** TypeScript, Jest/jsdom, existing `StreamingInlineCardRenderer` harness, Obsidian DOM helper shims, module-doc guard, graphify source graph.

---

## File Structure

- Modify: `tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`
  - Responsibility: focused DOM/unit coverage for inline question keyboard behavior.
- Modify: `src/features/chat/runtime/QuestionInlineCardRenderer.ts`
  - Responsibility: inline-local option focus, option toggle/select, sequential single-mode auto-advance, grouped non-submit behavior, and Escape rejection.
- Modify: `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
  - Responsibility: module-level documentation for inline keyboard behavior.
- Modify: `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json`
  - Responsibility: generated `src` graph artifacts after source changes, staged only if safe to isolate from unrelated dirty source work.

## Task 1: Extend Inline Renderer Keyboard Tests

**Files:**
- Modify: `tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`

- [ ] **Step 1: Extend imports and helper request factory**

Keep the existing imports and change the type import to include `QuestionDisplayMode`:

```typescript
import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
```

Change `createQuestionRequest()` to accept overrides:

```typescript
function createQuestionRequest(overrides?: Partial<QuestionRequest>): QuestionRequest {
  return {
    id: 'question-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Language',
        question: 'Which languages should be included?',
        options: [
          { label: 'TypeScript', description: 'Plugin code' },
          { label: 'Python', description: 'Scripts' },
        ],
        multiple: true,
        custom: true,
      },
      {
        header: 'Platform',
        question: 'Which platform should be verified?',
        options: [
          { label: 'Windows', description: 'Primary test platform' },
          { label: 'macOS', description: 'Secondary platform' },
        ],
        multiple: false,
        custom: false,
      },
    ],
    ...overrides,
  };
}
```

- [ ] **Step 2: Add DOM keyboard helpers**

Add these helpers below `createQuestionRequest()`:

```typescript
function createSingleSelectRequest(): QuestionRequest {
  return createQuestionRequest({
    questions: [
      {
        header: 'Language',
        question: 'Which language should be used?',
        options: [
          { label: 'TypeScript', description: 'Plugin code' },
          { label: 'Python', description: 'Scripts' },
        ],
        multiple: false,
        custom: false,
      },
      {
        header: 'Platform',
        question: 'Which platform should be verified?',
        options: [
          { label: 'Windows', description: 'Primary test platform' },
          { label: 'macOS', description: 'Secondary platform' },
        ],
        multiple: false,
        custom: false,
      },
    ],
  });
}

function optionInputs(cardEl: HTMLElement): HTMLInputElement[] {
  return [...cardEl.querySelectorAll<HTMLInputElement>(
    '.opencodian-question-inline-section input[type="checkbox"], .opencodian-question-inline-section input[type="radio"]',
  )];
}

function customInput(cardEl: HTMLElement): HTMLInputElement {
  const input = cardEl.querySelector<HTMLInputElement>('.opencodian-question-inline-custom');
  if (!input) {
    throw new Error('Expected custom input');
  }
  return input;
}

function keydown(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
  });
  target.dispatchEvent(event);
  return event;
}

async function flushInlineRender(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function expectPromisePending<T>(promise: Promise<T>): Promise<void> {
  const sentinel = Symbol('pending');
  const result = await Promise.race([
    promise,
    Promise.resolve(sentinel),
  ]);
  expect(result).toBe(sentinel);
}

async function renderInlineQuestion(options: {
  request?: QuestionRequest;
  displayMode: QuestionDisplayMode;
}) {
  const harness = createRendererHarness();
  const request = options.request ?? createQuestionRequest();
  const responsePromise = harness.renderer.collectAction(request, options.displayMode, 'tab-1');
  await flushInlineRender();
  const cardEl = harness.runtime.questionInlineCardEl;
  if (!cardEl) {
    throw new Error('Expected inline question card');
  }
  return {
    ...harness,
    cardEl,
    request,
    responsePromise,
  };
}
```

- [ ] **Step 3: Add option focus navigation test**

Append this test inside the existing `describe` block:

```typescript
  it('moves inline option focus with arrow and edge navigation keys', async () => {
    const { cardEl } = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    const inputs = optionInputs(cardEl);

    inputs[0].focus();
    expect(document.activeElement).toBe(inputs[0]);

    const arrowDown = keydown(inputs[0], 'ArrowDown');
    expect(arrowDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[1]);

    const arrowUp = keydown(inputs[1], 'ArrowUp');
    expect(arrowUp.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[0]);

    keydown(inputs[0], 'End');
    expect(document.activeElement).toBe(inputs[1]);

    keydown(inputs[1], 'Home');
    expect(document.activeElement).toBe(inputs[0]);
  });
```

- [ ] **Step 4: Add sequential Space auto-advance test**

Append:

```typescript
  it('auto-renders the next sequential single-select question after Space selects a non-final answer', async () => {
    const { cardEl, responsePromise, runtime } = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    const inputs = optionInputs(cardEl);

    inputs[1].focus();
    const event = keydown(inputs[1], ' ');
    await flushInlineRender();

    expect(event.defaultPrevented).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(runtime.questionInlineCardEl).toBe(cardEl);
    expect(cardEl.querySelector('.opencodian-question-inline-progress')?.textContent).toContain('2');
    expect(cardEl.querySelector('.opencodian-question-inline-header-text')?.textContent).toBe('Platform');
    await expectPromisePending(responsePromise);
  });
```

- [ ] **Step 5: Add sequential final Enter submit test**

Append:

```typescript
  it('submits the final sequential single-select question with Enter', async () => {
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    keydown(optionInputs(cardEl)[0], ' ');
    await flushInlineRender();

    const secondInputs = optionInputs(cardEl);
    secondInputs[0].focus();
    const event = keydown(secondInputs[0], 'Enter');

    expect(event.defaultPrevented).toBe(true);
    await expect(responsePromise).resolves.toEqual({
      type: 'reply',
      answers: [
        ['TypeScript'],
        ['Windows'],
      ],
    });
  });
```

- [ ] **Step 6: Add grouped Enter non-submit test**

Append:

```typescript
  it('selects a grouped radio with Enter without submitting an incomplete grouped request', async () => {
    const request = createSingleSelectRequest();
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request,
      displayMode: 'all',
    });
    const inputs = optionInputs(cardEl);

    inputs[0].focus();
    const event = keydown(inputs[0], 'Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(inputs[0].checked).toBe(true);
    await expectPromisePending(responsePromise);
  });
```

- [ ] **Step 7: Add multi-select no-auto-resolve test**

Append:

```typescript
  it('toggles sequential multi-select checkboxes without auto-resolving from option keys', async () => {
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request: createQuestionRequest(),
      displayMode: 'single',
    });
    const inputs = optionInputs(cardEl);

    inputs[0].focus();
    const space = keydown(inputs[0], ' ');
    const enter = keydown(inputs[1], 'Enter');

    expect(space.defaultPrevented).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(true);
    await expectPromisePending(responsePromise);
  });
```

- [ ] **Step 8: Add custom input and Escape tests**

Append:

```typescript
  it('keeps custom input Enter and arrow keys native while preserving submit collection', async () => {
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request: createQuestionRequest(),
      displayMode: 'single',
    });
    const input = customInput(cardEl);

    input.focus();
    const enter = keydown(input, 'Enter');
    const arrowDown = keydown(input, 'ArrowDown');
    input.value = 'Rust';
    cardEl.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit')?.click();
    await flushInlineRender();

    expect(enter.defaultPrevented).toBe(false);
    expect(arrowDown.defaultPrevented).toBe(false);
    expect(cardEl.querySelector('.opencodian-question-inline-header-text')?.textContent).toBe('Platform');

    const secondInputs = optionInputs(cardEl);
    secondInputs[0].checked = true;
    cardEl.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit')?.click();
    await expect(responsePromise).resolves.toEqual({
      type: 'reply',
      answers: [
        ['Rust'],
        ['Windows'],
      ],
    });
  });

  it('rejects inline questions with Escape from options and custom input', async () => {
    const optionCase = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    const optionEvent = keydown(optionInputs(optionCase.cardEl)[0], 'Escape');

    expect(optionEvent.defaultPrevented).toBe(true);
    await expect(optionCase.responsePromise).resolves.toEqual({ type: 'reject' });

    document.body.replaceChildren();

    const customCase = await renderInlineQuestion({
      request: createQuestionRequest(),
      displayMode: 'single',
    });
    const customEvent = keydown(customInput(customCase.cardEl), 'Escape');

    expect(customEvent.defaultPrevented).toBe(true);
    await expect(customCase.responsePromise).resolves.toEqual({ type: 'reject' });
  });
```

- [ ] **Step 9: Run the focused test and confirm failure before implementation**

Run:

```bash
npm test -- QuestionInlineCardRenderer --runInBand
```

Expected before implementation:
- Existing click tests still pass.
- New keyboard tests fail because inline cards do not handle keydown yet.

## Task 2: Implement Inline Keyboard Handling

**Files:**
- Modify: `src/features/chat/runtime/QuestionInlineCardRenderer.ts`
- Test: `tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`

- [ ] **Step 1: Add keyboard context types**

Add these interfaces near `SingleQuestionPromptOptions`:

```typescript
interface InlineQuestionKeyboardContext {
  inputState: QuestionInputState;
  question: QuestionRequest['questions'][number];
  reject: () => void;
  submitSingle?: (allowFinalSubmit: boolean) => void;
}
```

- [ ] **Step 2: Wire grouped section keyboard behavior**

In `collectGroupedQuestionAction()`, inside the `request.questions.forEach(...)` loop, capture the returned input state and attach a grouped handler:

```typescript
      const inputState = this.renderQuestionSection({
        questionCard,
        request,
        question,
        index,
      });
      inputStates[index] = inputState;
```

After `const action = await new Promise<QuestionInlineCardAction>((resolve) => {`, add a helper:

```typescript
      const reject = (): void => {
        resolve({ type: 'reject' });
      };
```

Before button listener registration, attach handlers for each grouped question:

```typescript
      request.questions.forEach((question, index) => {
        this.attachQuestionKeyboard(inputStates[index], {
          inputState: inputStates[index],
          question,
          reject,
        });
      });
```

Keep the existing submit button validation unchanged. Change the reject button click handler to call `reject()`:

```typescript
      buttons.rejectBtn.addEventListener('click', () => {
        buttons.rejectBtn.blur();
        reject();
      });
```

- [ ] **Step 3: Wire sequential section keyboard behavior**

In `promptForSingleQuestion()`, inside the Promise body, add local helpers before button listeners:

```typescript
      const reject = (): void => {
        resolve({ type: 'reject' });
      };
      const submitSingle = (allowFinalSubmit: boolean): void => {
        const answer = this.collectAnswerFromInputState(question, inputState);
        if (answer.length === 0) {
          return;
        }
        if (!allowFinalSubmit && index === total - 1) {
          return;
        }
        resolve({ type: 'reply', answer });
      };

      this.attachQuestionKeyboard(inputState, {
        inputState,
        question,
        reject,
        submitSingle,
      });
```

Then change the reject button click handler to call `reject()`:

```typescript
      buttons.rejectBtn.addEventListener('click', () => {
        buttons.rejectBtn.blur();
        reject();
      });
```

The existing submit button click handler should remain the explicit validation + resolve path, including the Notice on empty answer.

- [ ] **Step 4: Add private keyboard methods**

Add these private methods before `renderQuestionHeader()`:

```typescript
  private attachQuestionKeyboard(
    inputState: QuestionInputState,
    context: InlineQuestionKeyboardContext,
  ): void {
    const targets = [
      ...inputState.optionInputs,
      ...(inputState.customInput ? [inputState.customInput] : []),
    ];

    for (const target of targets) {
      target.addEventListener('keydown', (event) => {
        this.handleQuestionKeydown(event, context);
      });
    }
  }

  private handleQuestionKeydown(
    event: KeyboardEvent,
    context: InlineQuestionKeyboardContext,
  ): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      context.reject();
      return;
    }

    if (
      event.target instanceof HTMLInputElement
      && event.target.classList.contains('opencodian-question-inline-custom')
    ) {
      return;
    }

    const focusedIndex = context.inputState.optionInputs.findIndex((input) => input === event.target);
    if (focusedIndex < 0) {
      return;
    }

    if (this.handleOptionFocusKey(event, context.inputState.optionInputs, focusedIndex)) {
      return;
    }

    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    this.toggleOptionInput(context.inputState.optionInputs[focusedIndex], context.question);

    if (!context.question.multiple && context.submitSingle) {
      context.submitSingle(event.key === 'Enter');
    }
  }

  private handleOptionFocusKey(
    event: KeyboardEvent,
    optionInputs: readonly HTMLInputElement[],
    focusedIndex: number,
  ): boolean {
    const focusTargetByKey: Record<string, number | undefined> = {
      ArrowDown: focusedIndex + 1,
      ArrowRight: focusedIndex + 1,
      ArrowUp: focusedIndex - 1,
      ArrowLeft: focusedIndex - 1,
      Home: 0,
      End: optionInputs.length - 1,
    };
    const nextIndex = focusTargetByKey[event.key];
    if (nextIndex === undefined) {
      return false;
    }

    event.preventDefault();
    this.focusOptionInput(optionInputs, nextIndex);
    return true;
  }

  private focusOptionInput(optionInputs: readonly HTMLInputElement[], nextIndex: number): void {
    if (optionInputs.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(nextIndex, optionInputs.length - 1));
    optionInputs[boundedIndex]?.focus();
  }

  private toggleOptionInput(
    inputEl: HTMLInputElement | undefined,
    question: QuestionRequest['questions'][number],
  ): void {
    if (!inputEl) {
      return;
    }

    if (question.multiple) {
      inputEl.checked = !inputEl.checked;
      return;
    }

    inputEl.checked = true;
  }
```

- [ ] **Step 5: Run focused inline test**

Run:

```bash
npm test -- QuestionInlineCardRenderer --runInBand
```

Expected:
- All `QuestionInlineCardRenderer` tests pass.

- [ ] **Step 6: Run dock regression test**

Run:

```bash
npm test -- QuestionDock --runInBand
```

Expected:
- Existing dock keyboard coverage still passes.

- [ ] **Step 7: Run lint for touched source/test**

Run:

```bash
npm run lint -- src/features/chat/runtime/QuestionInlineCardRenderer.ts tests/unit/features/chat/QuestionInlineCardRenderer.test.ts
```

Expected:
- ESLint exits 0.

## Task 3: Update Inline Renderer Module Docs

**Files:**
- Modify: `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`

- [ ] **Step 1: Add keyboard behavior section**

After the "设计目的" section, add:

```markdown
## 键盘交互

Inline question card 的键盘处理保持在 `QuestionInlineCardRenderer` 本地，不安装全局 `document` / `window` listener。选项 input 获得焦点时，`ArrowDown` / `ArrowRight` 聚焦下一个选项，`ArrowUp` / `ArrowLeft` 聚焦上一个选项，`Home` / `End` 跳到首尾选项，`Space` 切换或选择当前选项，`Escape` 拒绝当前 question request。

`single` sequential 模式下，非最后一题的单选 `Space` 会在答案完整后 resolve 当前题，让 renderer 自动复用同一卡片进入下一题；最后一题仍需要 `Enter` 或提交按钮，避免误提交。`all` grouped 模式下，选项上的 `Enter` 只更新当前选项，不直接提交整组问题，完整性校验仍由提交按钮路径负责。多选题的 `Space` / `Enter` 只切换 checkbox，不自动前进或提交。自定义输入保留原生 `Enter` / 方向键编辑行为，`Escape` 仍作为 request-level reject 快捷键。
```

- [ ] **Step 2: Update public/private behavior notes**

In the existing "注意事项" list, add:

```markdown
- keyboard 行为必须复用现有 `QuestionInputState` 与 `collectAnswerFromInputState()`，不要引入第二套答案解析
```

- [ ] **Step 3: Run module-doc guard**

Run:

```bash
npm run check:module-docs
```

Expected:
- Module docs guard passes.

## Task 4: Graphify and Verification

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`

- [ ] **Step 1: Refresh graphify**

Run:

```bash
npm run graphify:update:src
```

Expected:
- Required report/json artifacts sync back to root `graphify-out/`.
- HTML viz may be skipped because the graph is too large; this is acceptable when report/json are updated.
- No `src/graphify-out/` remains.

- [ ] **Step 2: Check graphify freshness**

Run:

```bash
npm run check:graphify
```

Expected:
- Freshness check passes.

- [ ] **Step 3: Run focused verification bundle**

Run:

```bash
npm test -- QuestionInlineCardRenderer --runInBand
npm test -- QuestionDock --runInBand
npm run check:module-docs
npm run check:graphify
```

Expected:
- All commands pass.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run verify
```

Expected:
- Full verify passes.

If unrelated dirty files affect generated artifacts or staging, do not revert them. Use a clean temporary worktree to generate graphify artifacts from only this round's source/doc/test patch, then write those graphify blobs directly to the index.

## Task 5: Commit Round 2

**Files:**
- Stage only files changed by this round:
  - `src/features/chat/runtime/QuestionInlineCardRenderer.ts`
  - `tests/unit/features/chat/QuestionInlineCardRenderer.test.ts`
  - `docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md`
  - `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` only if isolated from unrelated source work

- [ ] **Step 1: Review scoped diff**

Run:

```bash
git diff -- src/features/chat/runtime/QuestionInlineCardRenderer.ts tests/unit/features/chat/QuestionInlineCardRenderer.test.ts docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md graphify-out/GRAPH_REPORT.md graphify-out/graph.json
```

Expected:
- `QuestionInlineCardRenderer.ts` contains inline-local keyboard helpers and Promise resolution wiring.
- `QuestionInlineCardRenderer.test.ts` contains focused keyboard tests plus existing click tests.
- `QuestionInlineCardRenderer.md` documents keyboard behavior.
- Graphify artifacts are generated from current source state or isolated clean-worktree state.

- [ ] **Step 2: Stage scoped files**

Run:

```bash
git add src/features/chat/runtime/QuestionInlineCardRenderer.ts tests/unit/features/chat/QuestionInlineCardRenderer.test.ts docs/modules/features/chat/runtime/QuestionInlineCardRenderer.md
```

If graphify artifacts are safe to include:

```bash
git add graphify-out/GRAPH_REPORT.md graphify-out/graph.json
```

Expected:
- Only this round's files are staged.
- Existing unrelated dirty files remain unstaged.

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "feat: add inline question keyboard controls"
```

Expected:
- Commit succeeds with only this round's scoped files.
