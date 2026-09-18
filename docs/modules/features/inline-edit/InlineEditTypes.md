# InlineEditTypes
> 2026-09-18 (R-B2): adds `InlineEditContextGroupRow` (id/name/entryCount) for the picker's topic section state.

> **源码**: `src/features/inline-edit/InlineEditTypes.ts`
> **状态**: [REVIEW]

## 概述

inline edit 的共享类型，使 controller 与 service 不必直接依赖插件主类、聊天视图或 registry。

## 职责

- `InlineEditHostAdapter`：宿主解析后的 backend 句柄，含 `kind`、`displayName`、`getAuxQuery()` 与 `resolveModel()`（返回 `{ ok: false, error }` 表示显式配置的模型不可用），以及 `supportsImages`（R-A4：会话级图片传输能力，`false` 时 UI 显式提示能力缺失而不是静默降级为无图请求）
- `InlineEditMode`：`selection` / `cursor-inline` / `cursor-inbetween` / `document`（R-A6 整篇形态）
- `InlineEditAnchor`：请求发起时的编辑器锚点，含 `from`/`to`、`snapshot`（脏检查基准）、行号与光标前后文
- `InlineEditOutcome`：`preview` / `clarification` / `error` 三态
- `InlineEditWidgetCallbacks`：widget 回调面
- 重新导出 `AgentAuxQueryCapability` / `AuxQuerySession` / `BackendModelSelection`，使 feature 内部模块不必各自深入 core 路径

## 依赖

- `../../core/agents/backend/AgentAuxQueryCapability`、`../../core/types/chat`

- `InlineEditContextFile`：附加上下文的候选项（`path` + 展示用 `name`）；`kind?: 'file' | 'folder'`（R-A7，缺省 `'file'`）区分文件与目录条目——目录在 `<attached_context>` 中渲染为 `[folder]` 前缀，表示"该目录下笔记是参考资料，按需读取"。每条目各计 1 个上限名额。

## 维护约束

- 纯类型模块，不要引入运行时依赖或副作用
- `InlineEditAnchor.snapshot` 的语义是"请求时刻的选区文本"，脏检查依赖它的全等性；不要改成行尾归一化后的文本

> 2026-09-18 (R-C3)：`InlineEditHostAdapter` 新增可选 `getInlineCompletion(): AgentInlineCompletionCapability | null`（host 未实现按「不可用」处理）。
