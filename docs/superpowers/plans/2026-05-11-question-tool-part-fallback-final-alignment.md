# Question Tool-Part Fallback Final Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the final conservative AskQuestion protocol fallback and calibrate docs/report so the AskQuestion mechanism is fully aligned to current source truth.

**Architecture:** `OpenCodeStreamEventTransformer` remains the sole stream-event owner. The new fallback reuses the existing `normalizeQuestionRequest()` host seam and only accepts explicit waiting `question` tool parts, preserving all existing tool rendering behavior.

**Tech Stack:** TypeScript, Jest, existing OpenCodian stream chunk types, module docs, graphify.

---

### Task 1: Add Failing Transformer Coverage

**Files:**
- Modify: `tests/unit/core/opencode/OpenCodeStreamEventTransformer.streamPartHandlingSuite.ts`

- [ ] **Step 1: Add a waiting question tool-part test**

Append this test inside `describe('OpenCodeStreamEventTransformer tool part mutations', ...)`:

```typescript
  it('emits question_request chunks from waiting question tool metadata', () => {
    const request = {
      id: 'question-waiting-1',
      sessionId: 'test-session',
      questions: [
        {
          header: 'Mode',
          question: 'Pick a mode',
          options: [{ label: 'Fast', description: 'Quick' }],
          multiple: false,
          custom: true,
        },
      ],
    };
    const host = createHost({
      normalizeQuestionRequest: jest.fn((raw) => {
        if (
          raw
          && typeof raw === 'object'
          && (raw as { id?: unknown }).id === 'question-waiting-1'
        ) {
          return request;
        }
        return null;
      }),
    });
    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-question-waiting',
            sessionID: 'test-session',
            messageID: 'assistant-question',
            type: 'tool',
            callID: 'call-question-waiting',
            tool: 'question',
            state: {
              status: 'waiting',
              input: {},
              metadata: {
                id: 'question-waiting-1',
                sessionID: 'test-session',
                questions: [
                  {
                    header: 'Mode',
                    question: 'Pick a mode',
                    options: [{ label: 'Fast', description: 'Quick' }],
                  },
                ],
              },
            },
          },
        },
      },
      'test-session',
      createState(),
      createStreamContext(),
    );

    expect(outcome.chunks).toContainEqual({ type: 'question_request', request });
  });
```

- [ ] **Step 2: Add a negative non-question waiting test**

Append:

```typescript
  it('does not treat non-question waiting tool metadata as question requests', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-shell-waiting',
            sessionID: 'test-session',
            messageID: 'assistant-shell',
            type: 'tool',
            callID: 'call-shell-waiting',
            tool: 'bash',
            state: {
              status: 'waiting',
              input: { command: 'npm test' },
              metadata: {
                id: 'not-a-question',
                sessionID: 'test-session',
                questions: [{ question: 'Ignore me', header: 'Ignore' }],
              },
            },
          },
        },
      },
      'test-session',
      createState(),
      createStreamContext(),
    );

    expect(host.normalizeQuestionRequest).not.toHaveBeenCalled();
    expect(outcome.chunks).not.toContainEqual(expect.objectContaining({
      type: 'question_request',
    }));
  });
```

- [ ] **Step 3: Add helper-path coverage**

Append:

```typescript
  it('emits question_request chunks from transformPartToChunks for waiting question parts', () => {
    const request = {
      id: 'question-helper-1',
      sessionId: 'test-session',
      questions: [
        {
          header: 'Mode',
          question: 'Pick a mode',
          options: [{ label: 'Fast', description: 'Quick' }],
          multiple: false,
          custom: true,
        },
      ],
    };
    const host = createHost({
      normalizeQuestionRequest: jest.fn(() => request),
    });
    const transformer = new OpenCodeStreamEventTransformer(host);

    const chunks = transformer.transformPartToChunks({
      id: 'part-question-helper',
      type: 'tool',
      callID: 'call-question-helper',
      tool: 'question',
      state: {
        status: 'waiting',
        metadata: {
          id: 'question-helper-1',
          sessionID: 'test-session',
          questions: [
            {
              header: 'Mode',
              question: 'Pick a mode',
              options: [{ label: 'Fast', description: 'Quick' }],
            },
          ],
        },
      },
    });

    expect(chunks).toContainEqual({ type: 'question_request', request });
  });
```

- [ ] **Step 4: Verify RED**

Run:

```bash
npm test -- OpenCodeStreamEventTransformer --runInBand
```

Expected: the new waiting-question tests fail because no `question_request` chunk is emitted from tool parts.

### Task 2: Implement Conservative Fallback

**Files:**
- Modify: `src/core/opencode/OpenCodeStreamEventTransformer.ts`

- [ ] **Step 1: Add helper methods near existing tool helpers**

Add:

```typescript
  private appendWaitingQuestionRequestChunk(
    part: OpenCodeStreamPart,
    chunks: StreamChunk[],
  ): void {
    const request = this.resolveWaitingQuestionRequest(part);
    if (!request) {
      return;
    }

    chunks.push({
      type: 'question_request',
      request,
    });
  }

  private resolveWaitingQuestionRequest(part: OpenCodeStreamPart): ChatQuestionRequest | null {
    if (
      part.type !== 'tool'
      || part.tool !== 'question'
      || part.state?.status !== 'waiting'
    ) {
      return null;
    }

    const metadata = part.state.metadata;
    const candidates: unknown[] = [
      metadata,
      metadata?.request,
      metadata?.question,
      part,
    ];

    for (const candidate of candidates) {
      const request = this.host.normalizeQuestionRequest(candidate);
      if (request) {
        return request;
      }
    }

    return null;
  }
```

- [ ] **Step 2: Call the helper from `handleToolPartUpdated()`**

After the `classifiedToolPart` null guard and before destructuring, call:

```typescript
    this.appendWaitingQuestionRequestChunk(toolPart, chunks);
```

- [ ] **Step 3: Call the helper from `appendToolPartChunks()`**

After the `classifiedToolPart` null guard and before destructuring, call:

```typescript
    this.appendWaitingQuestionRequestChunk(part, chunks);
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- OpenCodeStreamEventTransformer --runInBand
```

Expected: all transformer tests pass.

### Task 3: Update Docs And Status Report

**Files:**
- Modify: `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`
- Modify: `docs/archive/maintainability/phases/askquestion-mechanism-alignment-evaluation-2026-05-11.md`

- [ ] **Step 1: Update module docs**

Document that `question.asked` remains primary and a conservative waiting `question` tool-part fallback now exists. State that the fallback uses `normalizeQuestionRequest()` and ignores non-question tools.

- [ ] **Step 2: Calibrate the status report**

Change the report from a stale gap list to final state:

- Current score should reflect completed alignment: `9.0/10`.
- Keyboard navigation should be marked implemented for Dock and Inline.
- Waiter cleanup should be marked fixed.
- Protocol fallback should be marked implemented conservatively.
- Remaining non-blocking caveats should be limited to current-source upstream contract drift, not required OpenCodian work.

- [ ] **Step 3: Check stale claims**

Run:

```bash
rg -n "键盘导航完全缺失|鼠标操作|缺少 tool-part|后续 tool-part fallback|P1-2|waiter 超时|6\\.7/10|8\\.5/10" docs/archive/maintainability/phases/askquestion-mechanism-alignment-evaluation-2026-05-11.md
```

Expected: no stale old-gap claims remain except quoted historical context if explicitly labeled as historical.

### Task 4: Refresh Graph And Verify

**Files:**
- Modify generated graph blobs only for this round's source/doc changes:
  - `graphify-out/GRAPH_REPORT.md`
  - `graphify-out/graph.json`

- [ ] **Step 1: Refresh src graph**

Run:

```bash
npm run graphify:update:src
```

- [ ] **Step 2: Run focused checks**

Run:

```bash
npm test -- OpenCodeStreamEventTransformer --runInBand
npm run check:module-docs
npm run check:graphify
```

Expected: all pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected: lint, typecheck, tests, build, module-docs, graphify, and devlog order pass.

- [ ] **Step 4: Stage only scoped files**

Stage:

```bash
git add \
  docs/superpowers/specs/2026-05-11-question-tool-part-fallback-final-alignment-design.md \
  docs/superpowers/plans/2026-05-11-question-tool-part-fallback-final-alignment.md \
  src/core/opencode/OpenCodeStreamEventTransformer.ts \
  tests/unit/core/opencode/OpenCodeStreamEventTransformer.streamPartHandlingSuite.ts \
  docs/modules/core/opencode/OpenCodeStreamEventTransformer.md \
  docs/archive/maintainability/phases/askquestion-mechanism-alignment-evaluation-2026-05-11.md
```

If graphify root artifacts contain unrelated local dirty work, stage refreshed graph blobs through a clean temporary worktree or `git update-index --cacheinfo` rather than staging the current worktree files blindly.

- [ ] **Step 5: Commit**

Commit:

```bash
git commit -m "fix: add question tool waiting fallback"
```
