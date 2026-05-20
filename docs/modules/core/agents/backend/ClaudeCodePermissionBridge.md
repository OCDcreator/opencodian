# ClaudeCodePermissionBridge

> **源码**: `src/core/agents/backend/ClaudeCodePermissionBridge.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodePermissionBridge.ts` 是 Claude Code Agent SDK `canUseTool` 的隐藏 foundation 模块。它把 Claude 工具审批和 `AskUserQuestion` 输入转换成 OpenCodian 既有 permission/question 数据形状，再把用户决策转换回 SDK-compatible `PermissionResult`。

## 职责

- 提供 `canUseTool(toolName, input, context)` 入口，供后续 Claude adapter 传给 SDK options
- 将普通工具请求转换为 `permission_request` chunk 形状，复用现有 inline permission UI 的字段语义
- 将 `once`、`always`、`session`、`reject`、取消和 abort 映射成 Claude `allow` / `deny` result
- 根据 Claude `suggestions` 筛选 `updatedPermissions`，只在用户选择 always/session 时返回对应持久或会话更新
- 将 `AskUserQuestion` 的 `questions` 输入转换为 `QuestionRequest`，并把答案写回 `updatedInput.answers`
- 保持 SDK result 类型为本地兼容形状，避免在 Phase 0 引入官方 SDK 依赖

## 维护约束

- 不在这里渲染 UI；host callback 由后续 Claude adapter/runtime 注入。
- 不把 Claude permission mode 混入 OpenCode permission 设置；这里只处理单次 `canUseTool` 决策。
- `AskUserQuestion` 交互当前只生成可被 OpenCodian question UI 消费的请求；真实 SDK wiring 和超时/取消语义在 adapter 集成时补验证。
- 引入官方 SDK 类型后，优先用类型测试收窄 `ClaudeCodePermissionResult`，但保留 OpenCodian host 边界。
