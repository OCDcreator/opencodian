# ClaudeSettingsHookModel

> **源码**: `src/core/agents/backend/ClaudeSettingsHookModel.ts`
> **状态**: [ACTIVE]

## 概述

只读 hooks document model 与纯 mutation builder。它把严格 JSON 草稿中的 `hooks` 投影成可呈现的 event/group/handler view，并基于 `ClaudeSettingsHookSchema` 生成局部 `JsoncPathEdit`。输入不会被 mutation，未知事件/handler 和未知字段保留在 `raw`。

## 核心导出

| 导出 | 说明 |
|---|---|
| `inspectClaudeSettingsHooks(settings)` | 保留文档 key order，返回 supported 标记和 path diagnostics；错误 shape 不抛异常、不丢 raw。 |
| `buildClaudeHookGroupEdit(settings, event, mutation)` | add/update-matcher/delete/move group；只替换 `hooks[event]`，无 matcher 事件拒绝 matcher。 |
| `buildClaudeHookHandlerEdit(settings, event, groupIndex, mutation)` | add/update-field/delete/move handler；校验 common + type-specific required/kind/enum。 |

## 安全与保留规则

- 仅接受 schema 中的 known event/type 进行结构化编辑；unknown event/type 只读展示 raw，不能被 builder 擅自提升为可编辑控件。
- 新增/更新 handler 对 required fields、field kind、enum 进行 fail-closed 校验；`undefined` 可删除 optional field，但删除 required field 会失败。
- group/handler 的移动是 document-order mutation，不等价于 runtime execution order；schema 的精确语义是同一次匹配内 eligible handlers 并行、identical handlers 去重，而多次独立 async trigger 不去重。
- builder 只返回局部 edit；由宿主在同一 raw strict-JSON draft 上应用。写盘前仍必须经过 `ClaudeSettingsSourceService` 的 strict JSON validation、CAS、archive-before-mutation 和 evidence axes。

## Durable owner 边界

模型不拥有 DOM、文件 I/O、归档或 runtime probe。`ClaudeSettingsHooksBuilder` 是 UI owner，`SettingsClaudeConfigurationSection` 是 draft/selection owner，`ClaudeSettingsSourceService` 是 source/CAS/归档 owner。没有真实 runtime probe 时保存结果只能报告 `persistence`，`application` 及 `runtime` 不得被本模块提升。
