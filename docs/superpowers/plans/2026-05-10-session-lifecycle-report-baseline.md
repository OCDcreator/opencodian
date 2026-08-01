# Session Lifecycle Report Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revise `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md` into a current, source-grounded audit baseline that can safely feed later canonical session convergence work.

**Architecture:** This is a documentation-baseline slice. It corrects report claims, dates, evidence, and priority framing without changing TypeScript runtime behavior. Any later UI, layout, or style work must invoke `impeccable` first and preserve OpenCodian's Obsidian-native product UI vocabulary.

**Tech Stack:** Markdown, local git, `rg`, `git diff`, OpenCode CLI review gate, OpenCodian documentation conventions.

---

## File Structure

- Modify: `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`
  - Owns the public audit baseline for session lifecycle alignment.
  - Must remain an audit report, not an implementation plan.
- Reference only: `docs/superpowers/specs/2026-05-10-session-lifecycle-report-baseline-design.md`
  - Defines the approved design constraints for this documentation slice.
- Reference only: `src/core/opencode/OpenCodeSessionStateStore.ts`
  - Evidence for canonical session/message/part storage.
- Reference only: `src/features/chat/services/ConversationRenderService.ts`
  - Evidence for canonical-first render fallback behavior.
- Reference only: `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
  - Evidence for canonical projection plus `Conversation.messages` merge and persistence.
- Reference only: `src/features/chat/services/MessageFinalizationService.ts`
  - Evidence for post-stream sync, fingerprints, and final save behavior.
- Reference only: `src/features/chat/services/MessageSendPreparationService.ts`
  - Evidence for optimistic user message insertion and canonical seeding.
- Reference only: `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
  - Evidence for immediate sync-event application and listener dispatch.
- Reference only: `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - Evidence for session-keyed active stream replacement.
- Reference only: `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - Evidence for background task state reconstruction from conversation messages.

## Global Constraints

- Do not modify runtime TypeScript, CSS, generated assets, `reference-projects/`, or test code in this slice.
- Do not stage unrelated local changes or disturb the existing local commits ahead of `origin/main`.
- Keep `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md` as the only implementation target.
- Do not claim Council review has happened unless the current workflow actually ran it.
- If any task unexpectedly requires UI, layout, style, theme, visual component, or user-facing copy changes outside this report, stop and invoke `impeccable` before editing:

```text
IMPECCABLE_PREFLIGHT: context=pass product=pass command_reference=pass shape=pass|not_required image_gate=pass|skipped:<reason> mutation=open
```

For this plan's report-only scope, `shape=not_required` and `image_gate=skipped:docs-only report baseline` are valid because no interface surface is being changed.

## Task 1: Correct Report Header And Methodology Claims

**Files:**
- Modify: `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`
- Reference: `docs/superpowers/specs/2026-05-10-session-lifecycle-report-baseline-design.md`

- [ ] **Step 1: Inspect the current report header**

Run:

```bash
sed -n '1,40p' docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: The header shows the current report title, review date, reference baseline, and methodology claims.

- [ ] **Step 2: Replace the stale header block**

Edit the header block at the top of `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md` so it reads exactly:

```markdown
# OpenCodian 会话生命周期管理：对齐评估与优化增强报告

> **评估日期**：2026-05-10
> **当前仓库**：`/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian`
> **当前基线**：本地 `main` 当前检出状态，含未提交报告草稿；报告修订不改变 runtime 源码
> **对比基准**：opencode-desktop（OpenCode 官方 Electron 前端，SolidJS）
> **评估对象**：OpenCodian Obsidian 插件当前会话生命周期实现
> **评估方法**：本地源码审计 + 既有会话对齐审计复核 + 后续外部 Council 审查门
> **对比项目**：OpenCode — [https://github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode)
>
> 本报告涉及的 opencode-desktop 源码路径应在后续外部审查中重新确认。当前修订重点是让 OpenCodian 本地现状、证据边界和后续实施优先级准确可审查。
```

- [ ] **Step 3: Remove completed Council wording**

Run:

```bash
rg -n "Council|多模型|共识" docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: Matches show all remaining claims that imply a Council review already happened.

Replace any claim that says the report already completed multi-model Council review with wording that says external Council review is a pending gate. Use this exact replacement section title near the end if the report currently has a Council summary:

```markdown
## 8. 待外部审查议题

以下内容不是已完成的 Council 结论，而是提交给 `opencode` Council 审查的重点问题：
```

- [ ] **Step 4: Verify no completed Council claim remains**

Run:

```bash
rg -n "源码级全量审计 \\+ 多模型|所有 Council 成员|一致同意|多数同意" docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: No output.

## Task 2: Reframe The Core Technical Findings

**Files:**
- Modify: `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`
- Reference: `src/core/opencode/OpenCodeSessionStateStore.ts`
- Reference: `src/features/chat/services/ConversationRenderService.ts`
- Reference: `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
- Reference: `src/features/chat/services/MessageFinalizationService.ts`
- Reference: `src/features/chat/services/MessageSendPreparationService.ts`

- [ ] **Step 1: Recheck the local evidence anchors**

Run:

```bash
rg -n "private readonly sessions|resolveConversationRenderMessages|conversation\\.messages = merged|getConversationSyncFingerprint\\(conversation\\.messages\\)|conversation\\.messages\\.push\\(userMessage\\)" src/core/opencode/OpenCodeSessionStateStore.ts src/features/chat/services/ConversationRenderService.ts src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts src/features/chat/services/MessageFinalizationService.ts src/features/chat/services/MessageSendPreparationService.ts
```

Expected: Output includes canonical storage, canonical render fallback, sync merge persistence, finalization fingerprinting, and optimistic user message insertion.

- [ ] **Step 2: Update the double-truth finding**

Find the section titled `**双重真相详细分析**` and replace its opening explanation with this text:

```markdown
`OpenCodeSessionStateStore` 已经是本地 canonical graph，`ConversationRenderService.resolveConversationRenderMessages()` 在 canonical render messages 非空时会优先使用 canonical 投影。因此当前问题不应表述为“渲染层始终双重合并”。

更准确的风险是：`Conversation.messages` 仍参与 send、authoritative reload、sync merge、finalization fingerprint、error notice persistence 和 storage cache writeback。也就是说，OpenCodian 已经有 canonical 优先路径，但 reload / finalization / persistence 仍保留本地补偿路径。JS 单线程避免了真正的数据竞争，但 async interleaving 仍可能让 live stream、reload、post-sync 三条路径产出不同的 `ChatMessage[]` cache。
```

- [ ] **Step 3: Update the assessment conclusion for section 3.2**

Replace the current conclusion below the double-truth analysis with:

```markdown
**评估结论**：当前最大的架构风险不是“完全没有 canonical truth”，而是 canonical graph 与 `Conversation.messages` cache/compat 输出之间的职责边界仍不够硬。优先修复方向应是让 render / reload / finalization 的输入收敛到 canonical projection，再决定是否需要额外的串行写入保护。
```

- [ ] **Step 4: Verify the report no longer overstates render behavior**

Run:

```bash
rg -n "渲染层始终|总是双重|没有单一的仲裁机制确保两者一致|双重真相是当前最大的架构风险点" docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: No output.

## Task 3: Reorder The Roadmap Around Canonical Projection First

**Files:**
- Modify: `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`
- Reference: `docs/archive/maintainability/phases/opencode-session-alignment-current-audit-2026-04-21.md`
- Reference: `docs/archive/maintainability/phases/opencode-session-alignment-follow-up-plan-2026-04-21.md`

- [ ] **Step 1: Inspect the existing Tier 1 section**

Run:

```bash
sed -n '/### 4.1 Tier 1/,/### 4.2 Tier 2/p' docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: The first recommendation is currently the conversation write-lock mechanism.

- [ ] **Step 2: Replace Tier 1 with canonical-first ordering**

Replace the whole `### 4.1 Tier 1` section, up to but not including `### 4.2 Tier 2`, with this text:

```markdown
### 4.1 Tier 1 — 高优先级（canonical 收敛 + 维护性）

#### 建议 1：先做 canonical render / reload / finalization 收敛切片

- **问题**：当前 render 已 canonical 优先，但 reload、sync merge、finalization 和 persistence 仍通过 `Conversation.messages` 补偿层判断与修复。
- **方案**：让 `ConversationRenderService`、`ConversationAuthoritativeReloadCoordinator` 和 `MessageFinalizationService` 使用同一套 canonical-derived render input。`Conversation.messages` 在 canonical 存在时只作为 compatibility/cache writeback，不再覆盖 assistant body、tool output、structured payload 等 truth 字段。
- **影响**：高 — 直接降低 live stream、reload、post-sync 之间的漂移风险。
- **工作量**：中-高 — 需要 focused tests 证明普通文本、tool-first、synthetic parts、interrupted notice 等路径仍一致。
- **风险**：中 — 必须明确 client-only notice/decorations 的保留边界。
- **涉及文件**：
  - `ConversationRenderService.ts`
  - `ConversationTurnViewModelBuilder.ts`
  - `ConversationAuthoritativeReloadCoordinator.ts`
  - `ConversationAuthoritativeMessageMergeCoordinator.ts`
  - `ConversationSyncBridge.ts`
  - `MessageFinalizationService.ts`

#### 建议 2：引入 `TabSessionPhase` 只读派生视图

- **问题**：标签页会话状态仍分散在 `isStreaming`、`isConversationSyncInFlight`、`sessionStatus` 和 `StreamController.state.isStreaming` 等字段中。
- **方案**：先定义只读派生的 `TabSessionPhase`，用于 UI 和调试判断。初期不要删除现有布尔值，也不要让它成为第五个可写状态源。
- **影响**：中-高 — 让“会话到底忙不忙”的判断更清晰。
- **工作量**：中。
- **风险**：低-中 — 只读派生可以降低行为回归风险。

#### 建议 3：将串行写入保护降级为条件性稳定措施

- **问题**：多个 async 路径仍会写入 `Conversation.messages` cache。
- **方案**：不要先用 Promise chain 固化双重事实源。只有当 canonical 收敛切片后仍存在 cache writeback interleaving 时，再为剩余 cache 写入引入 per-conversation write lock。
- **影响**：中。
- **工作量**：中。
- **风险**：中 — 需要避免死锁和延迟渲染。

#### 建议 4：后台任务生命周期元数据持久化

- **问题**：`backgroundTaskLaunches` Map 不直接持久化，视图重载时主要从 `Conversation.messages` 重建。
- **方案**：在完成 canonical 收敛边界后，再评估是否在 `Conversation` metadata 中持久化最小后台任务生命周期信息。
- **影响**：中。
- **工作量**：低-中。
- **风险**：低。
```

- [ ] **Step 3: Update the implementation priority summary**

Find `## 7. 实施优先级总结` and make sure its Tier 1 list begins with canonical convergence. Use this exact summary block:

~~~markdown
```text
Tier 1（立即行动）
  ├── #1 canonical render/reload/finalization 收敛  ← 数据一致性基石
  ├── #2 TabSessionPhase 只读派生视图               ← 维护性基石
  ├── #3 条件性串行写入保护                         ← 收敛后再决定
  └── #4 后台任务元数据持久化                       ← 重载恢复增强

Tier 2（下一步）
  ├── #5 跟进提示队列                               ← UX 高价值改进
  └── #6 同步事件批处理                             ← 性能优化

Tier 3（长期方向）
  └── #7 双重真相收敛                               ← 架构简化，建立在 Tier 1 上
```
~~~

- [ ] **Step 4: Verify write lock is no longer first priority**

Run:

```bash
rg -n "先落地 #1 和 #2|串行变更机制\\s+← 数据完整性基石|建议 1：引入 `Conversation.messages` 串行变更机制" docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: No output.

## Task 4: Add Explicit UI Consistency Guard For Future Runtime Work

**Files:**
- Modify: `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`
- Reference: `PRODUCT.md`
- Reference: `DESIGN.md`
- Reference: `.codex/skills/impeccable/SKILL.md`
- Reference: `.codex/skills/impeccable/reference/product.md`

- [ ] **Step 1: Add an implementation guard note**

In the roadmap section after the Tier 1/Tier 2/Tier 3 summary, add this subsection:

```markdown
### UI / layout / style guard

本报告当前只建议后续实施方向，不直接改 UI。但如果后续 canonical 收敛实现触及聊天布局、消息渲染结构、状态提示、notice 卡片、工具调用展示、设置项或任何 CSS / theme token，执行者必须先调用 `$impeccable` 并通过 preflight。

OpenCodian 是 product-register UI：优先 Obsidian-native、紧凑、状态清晰、避免装饰性 glass、gradient text、side-stripe card accent、重复卡片网格和无意义动效。任何视觉调整都应保持现有 UI owner 边界，避免把新 runtime ownership 加回 `OpenCodianView.ts`。
```

- [ ] **Step 2: Verify the guard exists**

Run:

```bash
rg -n "UI / layout / style guard|impeccable|Obsidian-native" docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: Output includes the new guard subsection and mentions `$impeccable`.

## Task 5: Self-Review, Commit, And Prepare External Review

**Files:**
- Modify: `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`

- [ ] **Step 1: Run report self-review searches**

Run:

```bash
rg -n "2025-05-10|源码级全量审计 \\+ 多模型|所有 Council 成员|一致同意|多数同意|T""BD|T""ODO|implement"" later|place""holder" docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: No output.

- [ ] **Step 2: Inspect the final report diff while the report is untracked**

Run:

```bash
git diff --no-index -- /dev/null docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md || true
```

Expected: Diff output shows the full report as an added file and its content matches this plan's report-baseline scope. The `|| true` is intentional because `git diff --no-index` exits with `1` when differences exist.

- [ ] **Step 3: Verify no unrelated files changed, including untracked files**

Run:

```bash
git status --short | rg -v '^\?\? docs/status/session-lifecycle-alignment-evaluation\.md$'
```

Expected: No output.

- [ ] **Step 4: Stage only the report**

Run:

```bash
git add docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: Command succeeds with no output.

- [ ] **Step 5: Commit the report baseline**

Run:

```bash
git commit -m "docs: correct session lifecycle audit baseline"
```

Expected: Commit succeeds and mentions only `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`.

- [ ] **Step 6: Prepare the opencode Council review prompt**

Use this exact prompt for the external review gate:

```text
请作为 Council 审查者审查当前 OpenCodian 工作区的会话生命周期报告基线修订。

目标文件：
- docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
- docs/superpowers/specs/2026-05-10-session-lifecycle-report-baseline-design.md
- docs/superpowers/plans/2026-05-10-session-lifecycle-report-baseline.md

请重点检查：
1. 报告是否仍包含未证实的已完成 Council / 多模型审查声明。
2. 报告是否准确区分 canonical-first render 和 reload/finalization/persistence compensation。
3. 是否有过强、无源码证据、或和当前代码不一致的结论。
4. 第一实施切片是否应该聚焦 canonical render/reload/finalization 收敛。
5. UI/layout/style guard 是否足够明确要求后续视觉改动先调用 impeccable，并保持 Obsidian-native product UI 一致性。
6. 是否存在 scope creep，例如把报告修复写成 runtime 实现计划。

请输出：
- verdict: pass 或 fail
- blocking issues: 如有，列出必须修复项
- non-blocking suggestions: 可选建议

请基于当前工作区和最终 diff 审查，不要只根据分支历史推断。
```

Expected: The prompt is ready for `opencode run --dir "/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian"`.

## Task 6: Post-Review Acceptance

**Files:**
- Modify only if Council review fails: `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`

- [ ] **Step 1: If Council verdict is pass, hand off to acceptance**

Expected: The validator checks the committed report, `git status --short --branch`, and the Council verdict. No additional report edits are needed.

- [ ] **Step 2: If Council verdict is fail, apply only blocking report fixes**

For each blocking issue, edit only `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`. Do not expand scope into runtime code.

- [ ] **Step 3: Re-run self-review after any blocking fixes**

Run:

```bash
rg -n "2025-05-10|源码级全量审计 \\+ 多模型|所有 Council 成员|一致同意|多数同意|T""BD|T""ODO|implement"" later|place""holder" docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
```

Expected: No output.

- [ ] **Step 4: Commit any blocking review fixes**

Run:

```bash
git add docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md
git commit -m "docs: address session lifecycle audit review"
```

Expected: Commit succeeds and includes only the report file.

- [ ] **Step 5: Repeat Council review until pass**

Run the same `opencode run --dir "/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian"` review prompt from Task 5 Step 6 until the verdict is `pass`.

Expected: External review returns `verdict: pass`.

## Self-Review Checklist For This Plan

- Spec coverage: Tasks cover report date/baseline, unsupported Council claims, source evidence, canonical-first nuance, roadmap priority, impeccable UI guard, self-review, commit, and external review.
- Unfinished-marker scan: The plan should not leave vague or unbounded implementation steps.
- Type consistency: This plan is docs-only and introduces no TypeScript types, methods, or properties.
- Scope check: Runtime implementation is explicitly excluded. The only implementation target is `docs/archive/maintainability/phases/session-lifecycle-alignment-evaluation.md`.
