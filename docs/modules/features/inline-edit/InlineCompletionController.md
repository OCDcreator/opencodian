# InlineCompletionController

> **源码**: `src/features/inline-edit/InlineCompletionController.ts`
> **状态**: [REVIEW]

## 概述

R-C3 的每编辑器状态机。池是全局的，正确性状态在这：每视图**代数计数器**（§3.2.5）+ AbortController 双保险——触发、键入、Esc、新 Alt 都会使代数 +1，任何迟到回合（含流式 chunk）按代数丢弃，后端 abort 不及时也不能覆盖 ghost（验收 2）。

## 职责

- `trigger(editor, notePath)`：前置链按成本排序——enabled → 无活动行内编辑（两功能不共存，§3.2.7）→ 有 EditorView → 非组合态 → 非 readOnly → 有宿主笔记 → 取消旧态 → 建窗 → `pool.obtain()` → `complete()`
- `onEditorActivity`：键入/选区移动（ghost 扩展 updateListener）走 `cancelForView`（abort + 代数 + 清 ghost effect）
- `accept(view)`（Tab）：读 ghost → §4.2 位置与前缀尾一致性校验（漂移即丢弃，绝不拼接）→ **单事务** `dispatch({ changes, selection, effects: 清 ghost, userEvent: 'input.complete' })`（单步撤销，验收 3）
- `dismiss(view)`（Esc）：清 effect + abort，文档零变化（验收 4）
- 每回合过 `findWriteToolCalls`：命中 → `pool.reportWriteToolViolation` + 丢弃建议（§3.2.3）
- 流式 chunk 与最终结果同一条 `showValidated` 路径：代数检查 → `validateCompletion` → 光标漂移检查 → setGhost

## 依赖

- `./InlineCompletionService`（池）、`./InlineCompletionGhost`、`./InlineCompletionPrompt`、`./InlineEditEditorView`、`../../core/agents/backend/AgentAuxQueryCapability`（审计）、`../../i18n`

## 维护约束

- 不直接接触后端/registry；一切经池与宿主注入，保持可单测
- `complete()` 的 rejection 必须按失败回合处理（不崩、计入失败链）
- 前置链的顺序即成本序，不要把需要编辑器状态的检查挪到门控之前
