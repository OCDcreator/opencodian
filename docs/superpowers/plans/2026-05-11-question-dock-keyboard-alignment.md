# Question Dock Keyboard Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard operation to the above-input `QuestionDock` without changing Inline question cards or protocol behavior.

**Architecture:** Keep keyboard behavior local to `src/features/chat/ui/QuestionDock.ts`, because that file owns the dock DOM, option inputs, custom input, and footer controls. Add focused DOM tests for `QuestionDock`, then implement small private methods that reuse the existing answer collection and callback paths.

**Tech Stack:** TypeScript, Jest/jsdom, Obsidian DOM helper shims, existing `QuestionDock` render state/callback contracts, module-doc guard, graphify source graph.

---

## File Structure

- Create: `tests/unit/features/chat/QuestionDock.test.ts`
  - Responsibility: focused DOM/unit coverage for above-input dock keyboard behavior.
- Modify: `src/features/chat/ui/QuestionDock.ts`
  - Responsibility: dock-local keyboard navigation, option selection, single-mode auto-advance, and shared submit/next handling.
- Modify: `docs/modules/features/chat/ui/QuestionDock.md`
  - Responsibility: module-level documentation for `QuestionDock` keyboard behavior.
- Modify: `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json`
  - Responsibility: generated `src` graph artifacts after source changes, if the refreshed graph is safe to stage without mixing unrelated source work.

## Task 1: Add Focused QuestionDock Keyboard Tests

**Files:**
- Create: `tests/unit/features/chat/QuestionDock.test.ts`

- [ ] **Step 1: Create the test harness**

Create `tests/unit/features/chat/QuestionDock.test.ts` with this starting content:

```typescript
import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
import {
  QuestionDock,
  type QuestionDockCallbacks,
  type QuestionDockRenderState,
} from '../../../../src/features/chat/ui/QuestionDock';
import { setLocale } from '../../../../src/i18n';

function createQuestionRequest(overrides?: Partial<QuestionRequest>): QuestionRequest {
  return {
    id: 'request-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Language',
        question: 'Which language should be used?',
        options: [
          { label: 'TypeScript', description: 'Plugin code' },
          { label: 'Python', description: 'Scripts' },
          { label: 'Rust', description: 'Native helper' },
        ],
        multiple: false,
        custom: true,
      },
      {
        header: 'Platform',
        question: 'Which platform should be verified?',
        options: [
          { label: 'Windows', description: 'Primary platform' },
          { label: 'macOS', description: 'Secondary platform' },
        ],
        multiple: false,
        custom: false,
      },
    ],
    ...overrides,
  };
}

function createCallbacks(): jest.Mocked<QuestionDockCallbacks> {
  return {
    onAnswerChange: jest.fn(),
    onSelectGroup: jest.fn(),
    onSelectQuestion: jest.fn(),
    onSubmit: jest.fn(),
    onReject: jest.fn(),
    onClose: jest.fn(),
  };
}

function renderDock(options?: {
  request?: QuestionRequest;
  answers?: string[][];
  displayMode?: QuestionDisplayMode;
  activeQuestionIndex?: number | null;
  callbacks?: jest.Mocked<QuestionDockCallbacks>;
}) {
  const parentEl = document.body.createDiv();
  const dock = new QuestionDock(parentEl);
  const request = options?.request ?? createQuestionRequest();
  const callbacks = options?.callbacks ?? createCallbacks();
  const state: QuestionDockRenderState = {
    request,
    answers: options?.answers ?? request.questions.map(() => []),
    displayMode: options?.displayMode ?? 'single',
    activeQuestionIndex: options?.activeQuestionIndex ?? 0,
  };

  dock.render(state, callbacks);

  return {
    callbacks,
    dock,
    parentEl,
    request,
    rootEl: parentEl.querySelector<HTMLElement>('.opencodian-question-dock'),
  };
}

function optionInputs(rootEl: HTMLElement): HTMLInputElement[] {
  return [...rootEl.querySelectorAll<HTMLInputElement>(
    '.opencodian-question-dock-section input[type="checkbox"], .opencodian-question-dock-section input[type="radio"]',
  )];
}

function customInput(rootEl: HTMLElement): HTMLInputElement {
  const input = rootEl.querySelector<HTMLInputElement>('.opencodian-question-inline-custom');
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

describe('QuestionDock keyboard interaction', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
    setLocale('en');
  });

  afterEach(() => {
    document.body.replaceChildren();
  });
});
```

- [ ] **Step 2: Add arrow focus movement test**

Append this test inside the `describe` block:

```typescript
  it('moves option focus with arrow and edge navigation keys', () => {
    const { rootEl } = renderDock();
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[0].focus();
    expect(document.activeElement).toBe(inputs[0]);

    const arrowDown = keydown(inputs[0], 'ArrowDown');
    expect(arrowDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[1]);

    const arrowUp = keydown(inputs[1], 'ArrowUp');
    expect(arrowUp.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[0]);

    keydown(inputs[0], 'End');
    expect(document.activeElement).toBe(inputs[2]);

    keydown(inputs[2], 'Home');
    expect(document.activeElement).toBe(inputs[0]);
  });
```

- [ ] **Step 3: Add Space selection + single auto-advance test**

Append:

```typescript
  it('selects a focused radio with Space and auto-advances single-mode non-final questions', () => {
    const { callbacks, rootEl } = renderDock();
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[1].focus();
    const event = keydown(inputs[1], ' ');

    expect(event.defaultPrevented).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(callbacks.onAnswerChange).toHaveBeenCalledWith(0, ['Python']);
    expect(callbacks.onSelectQuestion).toHaveBeenCalledWith(1);
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Add Enter final-submit test**

Append:

```typescript
  it('submits with Enter on a final answered single-select question', () => {
    const request = createQuestionRequest();
    const { callbacks, rootEl } = renderDock({
      request,
      answers: [[], ['Windows']],
      displayMode: 'single',
      activeQuestionIndex: 1,
    });
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[0].focus();
    const event = keydown(inputs[0], 'Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.onAnswerChange).toHaveBeenCalledWith(1, ['Windows']);
    expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelectQuestion).not.toHaveBeenCalled();
  });
```

- [ ] **Step 5: Add Escape reject and custom-input preservation tests**

Append:

```typescript
  it('rejects the active dock request with Escape from an option', () => {
    const { callbacks, rootEl } = renderDock();
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[0].focus();
    const event = keydown(inputs[0], 'Escape');

    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.onReject).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('keeps custom text input keyboard editing on the native input path', () => {
    const { callbacks, rootEl } = renderDock();
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const input = customInput(rootEl);

    input.focus();
    const enter = keydown(input, 'Enter');
    const arrowDown = keydown(input, 'ArrowDown');
    input.value = 'Go';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(enter.defaultPrevented).toBe(false);
    expect(arrowDown.defaultPrevented).toBe(false);
    expect(callbacks.onSelectQuestion).not.toHaveBeenCalled();
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
    expect(callbacks.onAnswerChange).toHaveBeenCalledWith(0, ['Go']);
  });
```

- [ ] **Step 6: Add multi-select no-auto-advance test**

Append:

```typescript
  it('toggles multi-select checkboxes without auto-advancing or submitting', () => {
    const request = createQuestionRequest({
      questions: [
        {
          header: 'Targets',
          question: 'Which targets should be checked?',
          options: [
            { label: 'Dock' },
            { label: 'Inline' },
          ],
          multiple: true,
          custom: false,
        },
        {
          header: 'Follow-up',
          question: 'Should this remain pending?',
          options: [{ label: 'Yes' }],
          multiple: false,
          custom: false,
        },
      ],
    });
    const { callbacks, rootEl } = renderDock({ request });
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[0].focus();
    const space = keydown(inputs[0], ' ');
    const enter = keydown(inputs[1], 'Enter');

    expect(space.defaultPrevented).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(callbacks.onAnswerChange).toHaveBeenLastCalledWith(0, ['Dock', 'Inline']);
    expect(callbacks.onSelectQuestion).not.toHaveBeenCalled();
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
```

- [ ] **Step 7: Run the new focused test and confirm failure before implementation**

Run:

```bash
npm test -- QuestionDock --runInBand
```

Expected before implementation:
- New `QuestionDock.test.ts` fails because arrow keys/Space/Enter/Escape do not yet have custom dock behavior.

## Task 2: Implement Dock Keyboard Handling

**Files:**
- Modify: `src/features/chat/ui/QuestionDock.ts`
- Test: `tests/unit/features/chat/QuestionDock.test.ts`

- [ ] **Step 1: Add private keyboard helpers**

In `src/features/chat/ui/QuestionDock.ts`, add these private methods inside `QuestionDock` before `renderFooter()`:

```typescript
  private handleQuestionKeydown(options: {
    event: KeyboardEvent;
    question: QuestionRequest['questions'][number];
    questionIndex: number;
    sectionEl: HTMLElement;
    displayMode: QuestionDisplayMode;
    viewModel: QuestionDockViewModel;
    callbacks: QuestionDockCallbacks;
  }): void {
    const {
      event,
      question,
      questionIndex,
      sectionEl,
      displayMode,
      viewModel,
      callbacks,
    } = options;

    if (event.target instanceof HTMLInputElement
      && event.target.classList.contains('opencodian-question-inline-custom')) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      callbacks.onReject();
      return;
    }

    const optionInputs = this.getOptionInputs(sectionEl);
    const focusedIndex = optionInputs.findIndex((input) => input === event.target);
    if (focusedIndex < 0) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.focusOptionInput(optionInputs, focusedIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      this.focusOptionInput(optionInputs, focusedIndex - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      this.focusOptionInput(optionInputs, 0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      this.focusOptionInput(optionInputs, optionInputs.length - 1);
      return;
    }

    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    this.toggleOptionInput(optionInputs[focusedIndex], question);
    const answer = this.collectAnswerFromSection(sectionEl, question);
    callbacks.onAnswerChange(questionIndex, answer);

    if (
      displayMode === 'single'
      && !question.multiple
      && isQuestionAnswerComplete(question, answer)
      && event.key === ' '
      && questionIndex < viewModel.totalCount - 1
    ) {
      callbacks.onSelectQuestion(questionIndex + 1);
      return;
    }

    if (event.key === 'Enter' && !question.multiple) {
      this.handleSubmitOrNext(viewModel, displayMode, new Map([[questionIndex, sectionEl]]), callbacks);
    }
  }

  private getOptionInputs(sectionEl: HTMLElement): HTMLInputElement[] {
    return [...sectionEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')];
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

- [ ] **Step 2: Wire keydown on question sections**

In `renderBody()`, after `sectionElements.set(visibleQuestion.index, sectionEl);`, add:

```typescript
      sectionEl.addEventListener('keydown', (event) => {
        this.handleQuestionKeydown({
          event,
          question: visibleQuestion.question,
          questionIndex: visibleQuestion.index,
          sectionEl,
          displayMode,
          viewModel,
          callbacks,
        });
      });
```

- [ ] **Step 3: Extract shared submit/next handler**

Replace the submit button click body in `renderFooter()` with:

```typescript
    submitBtn.addEventListener('click', () => {
      this.handleSubmitOrNext(viewModel, displayMode, sectionElements, callbacks);
    });
```

Add this private method before `collectAnswerFromSection()`:

```typescript
  private handleSubmitOrNext(
    viewModel: QuestionDockViewModel,
    displayMode: QuestionDisplayMode,
    sectionElements: ReadonlyMap<number, HTMLElement>,
    callbacks: QuestionDockCallbacks,
  ): void {
    if (displayMode === 'single') {
      const current = viewModel.visibleQuestions[0];
      if (!current) {
        return;
      }

      const sectionEl = sectionElements.get(current.index);
      const answer = sectionEl
        ? this.collectAnswerFromSection(sectionEl, current.question)
        : current.answer;
      if (!isQuestionAnswerComplete(current.question, answer)) {
        return;
      }

      callbacks.onAnswerChange(current.index, answer);
      if (current.index < viewModel.totalCount - 1) {
        callbacks.onSelectQuestion(current.index + 1);
        return;
      }
    }

    callbacks.onSubmit();
  }
```

- [ ] **Step 4: Run focused test**

Run:

```bash
npm test -- QuestionDock --runInBand
```

Expected:
- `QuestionDock.test.ts` passes.

- [ ] **Step 5: Run coordinator regression test**

Run:

```bash
npm test -- QuestionDockCoordinator --runInBand
```

Expected:
- `QuestionDockCoordinator.test.ts` still passes.

- [ ] **Step 6: Run lint for touched source/test**

Run:

```bash
npm run lint -- src/features/chat/ui/QuestionDock.ts tests/unit/features/chat/QuestionDock.test.ts
```

Expected:
- ESLint exits 0.

## Task 3: Update QuestionDock Module Docs

**Files:**
- Modify: `docs/modules/features/chat/ui/QuestionDock.md`

- [ ] **Step 1: Add keyboard behavior documentation**

In `docs/modules/features/chat/ui/QuestionDock.md`, after the "显示模式" subsection, add:

```markdown
### 键盘交互

Dock 的键盘处理是组件本地行为，不安装全局 `document` / `window` listener。焦点在选项 input 上时，`ArrowDown` / `ArrowRight` 聚焦下一个选项，`ArrowUp` / `ArrowLeft` 聚焦上一个选项，`Home` / `End` 跳到首尾选项，`Space` 切换或选择当前选项，`Enter` 复用 footer 的下一步 / 提交流程，`Escape` 走拒绝回调。

选项仍使用原生 radio / checkbox input 作为焦点目标，保持浏览器与辅助技术语义。`single` 模式下，非最后一题的单选选项在完成答案后会自动调用 `onSelectQuestion(index + 1)` 前进；最后一题不会因单次选项选择自动提交，仍需 `Enter` 或提交按钮。自定义文本输入保留原生文字编辑行为，不参与选项导航快捷键。
```

- [ ] **Step 2: Update key method table**

In the "关键方法" table, add rows for:

```markdown
| `handleQuestionKeydown(...)` | 处理 dock 内选项焦点、选择、下一步/提交与拒绝快捷键 |
| `handleSubmitOrNext(...)` | 复用 footer 与键盘 Enter 的 single 模式下一步/提交逻辑 |
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
- If HTML viz fails because the graph is too large, that is acceptable only if the wrapper still syncs required report/json artifacts.
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
npm test -- QuestionDock --runInBand
npm test -- QuestionDockCoordinator --runInBand
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

If unrelated dirty files affect generated artifacts or staging, do not revert them. Record the exact leftover files and stage only this round's intended files.

## Task 5: Commit Round 1

**Files:**
- Stage only files changed by this round:
  - `src/features/chat/ui/QuestionDock.ts`
  - `tests/unit/features/chat/QuestionDock.test.ts`
  - `docs/modules/features/chat/ui/QuestionDock.md`
  - `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` only if safe to stage without mixing unrelated source work

- [ ] **Step 1: Review scoped diff**

Run:

```bash
git diff -- src/features/chat/ui/QuestionDock.ts tests/unit/features/chat/QuestionDock.test.ts docs/modules/features/chat/ui/QuestionDock.md graphify-out/GRAPH_REPORT.md graphify-out/graph.json
```

Expected:
- `QuestionDock.ts` contains dock-local keyboard helpers and shared submit/next handler.
- `QuestionDock.test.ts` contains focused keyboard tests.
- `QuestionDock.md` documents keyboard behavior.
- Graphify artifacts are generated only from current source state.

- [ ] **Step 2: Stage scoped files**

Run:

```bash
git add src/features/chat/ui/QuestionDock.ts tests/unit/features/chat/QuestionDock.test.ts docs/modules/features/chat/ui/QuestionDock.md
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
git commit -m "feat: add question dock keyboard controls"
```

Expected:
- Commit succeeds with only this round's scoped files.
