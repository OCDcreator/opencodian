# ClaudeSettingsHookSchema

> **源码**: `src/core/agents/backend/ClaudeSettingsHookSchema.ts`
> **状态**: [ACTIVE]

## 概述

Claude Code `settings.json` hooks 的唯一 schema metadata owner。模块只有常量、类型和 provenance，不解析、不写文件、不渲染 UI。它描述设置文件契约，不把 Agent SDK callback 层的 hook 名称误当成 settings runtime 行为证明。

## Schema

- `CLAUDE_HOOK_EVENTS` 收录 30 个文档事件；`CLAUDE_HOOK_EVENT_CATALOG` 记录 matcher 是否支持、matcher kind、字段和已确认 suggestions。没有 matcher 的事件明确拒绝 matcher，而不是静默改写。
- `CLAUDE_HOOK_HANDLER_TYPES` 收录 `command`、`http`、`mcp_tool`、`prompt`、`agent` 五种 handler。
- common fields 为必需 `type` 与可选 `if`、`timeout`、`statusMessage`；每种 handler 的 required/optional fields、kind、enum 由 `CLAUDE_HOOK_TYPE_FIELDS` 给出。
- `once`、`rewakeMessage`、`rewakeSummary` 等未列入 structured catalog 的未知/内部字段必须由上层原样保留，不得凭 schema metadata 丢弃；`once` 在 skill frontmatter 可有其他语义，但 settings files 与 agent frontmatter 不由本 schema 暴露或执行。

## Provenance 与执行边界

`CLAUDE_HOOK_SCHEMA_EVIDENCE` 固定记录 CLI `2.1.204`、Agent SDK `0.3.145`、SDK bundled Claude Code `2.1.145`，以及 2026-07-25 访问的官方 hooks/settings 文档。metadata 的执行语义只限于：同一次匹配内的 eligible handlers 并行；相同 handler 定义去重；多次独立 async trigger 不去重；`order=document-only`。编辑器的移动只改变文档顺序，不声称 hooks 按该顺序串行执行。除非存在真实 runtime probe，runtime evidence 必须保持 `unavailable`。

## 依赖与维护

上游为版本/官方文档证据；下游为 `ClaudeSettingsHookModel` 和 `ClaudeSettingsHooksBuilder`。任何字段扩展先更新该目录，再更新模型校验、UI 和 focused tests；不要在 presenter 中复制 schema。
