# ClaudeSettingsHookFieldControls

> **源码**: `src/features/settings/ClaudeSettingsHookFieldControls.ts`
> **状态**: [ACTIVE]

## 概述

Claude hooks builder 的 handler 字段控件 owner。负责单个 hook handler 的已知字段 label/input 渲染、typed parse 和 handler type 切换的 replacement 构造；所有 mutation 仍经 host 回调回到 builder 的唯一 `applyEdit` 路径，advanced JSON 与结构化表单保持同一 raw draft。

## 核心行为

- `renderField()` 按 schema 字段（common + type-specific）创建稳定 `data-claude-hooks-handler-field` 控件；type 字段和 optional boolean 用 select，其余用 input（number/checkbox/text），string-array/record/object 以 JSON 文本编辑，空值表示移除（optional）或报错（required）。
- type 切换合并当前字段与该类型默认 handler（`defaultClaudeHookHandler()`），经 host `applyEdit` 写回；未知 type 只报 inline diagnostic。
- parse 失败时给控件置 `aria-invalid` 和指向可见共享 diagnostic 的 `aria-describedby`，不改 draft；成功路径由 builder 重渲染自然清除，避免控件指向 hidden ancestor 中的 diagnostic。

## Durable owner 关系

`ClaudeSettingsHooksBuilder` 拥有 event/group/handler 结构、唯一 accessible name 与焦点恢复；本 owner 只管字段级控件与 parse；`ClaudeSettingsHookSchema`/`ClaudeSettingsHookModel` 拥有 schema 与纯 model 编辑。保存仍由 source service 执行 strict JSON、CAS、archive-before-mutation。
