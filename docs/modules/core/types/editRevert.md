# editRevert（类型）

> **源码**: `src/core/types/editRevert.ts`
> **状态**: [REVIEW]

## 概述

`EditRevertServicePort` —— R-B3 编辑回退的**消费方自有接缝**（consumer-owned seam）。规范实现住在 `src/core/storage/EditRevertService.ts`（core.storage owner）；本文件把 port 声明在 core.types，让实现方与 feature 层消费方（侧栏 coordinator、聊天 runtime composition、插件 composition root）都能依赖它而不引入跨 owner 的运行时 import。

## 导入关系

```text
上游: src/shared/editRevertPlan.ts（re-export 全部纯数据类型）
下游: src/core/types/index.ts（barrel）、src/features/chat/ChatPluginPort.ts、src/features/chat/runtime/ChatRuntimeComposition.ts、src/main.ts
```

## 导出面

- **re-export（type-only）**：`EditRevertActionResult`、`EditRevertEntrySource`、`EditRevertEntryState`、`EditRevertExcludedReason`、`EditRevertFileEntry`、`EditRevertFileStatus`、`EditRevertPreImageStatus`、`EditRevertRoundMeta`、`EditRevertRoundSummary`、`EditRevertSidebarEntry`、`EditRevertSidebarModel`、`EditRevertWriteToolKind`。
- **自有接口**：
  - `EditRevertTurnBeginInfo`：`conversationId` / `backend` / `sessionId?` / `userText`（预算化预快照的候选来源）/ `contextPaths`（本轮附加上下文路径）。
  - `EditRevertWriteToolInfo`：`conversationId` / `toolName` / `input`（流上 `tool_use` chunk 的原始声明，先于工具结果）。
  - `EditRevertServicePort`：`getSidebarModel` / `beginTurnCapture` / `endTurnCapture` / `noteWriteToolUse` / `revertFile` / `revertAll` / `restoreFile` / `onEntriesChanged`。所有捕获方法均为 fail-soft（同步返回、内部吞错）。
  - **R-B5 插件发起批量捕获（可选成员）**：`beginBatchCapture?(conversationId, paths)`（强制预捕获全部路径、无回合预算；禁用/失败解析为 `false`，调用方必须拒绝执行）、`notePluginMove?(conversationId, from, to)`（记录 `moved` 条目，回退 = 改回并还原引用）、`notePluginWrite?(conversationId, path)`（从强制捕获解析 pre-image 记录写入条目）、`endBatchCapture?(conversationId)`（立即关闭、无 post-turn grace，回退即时可用）。声明为可选成员是为了不破坏聊天侧测试替身；具体服务始终实现，批量协调器在缺失时 fail-closed 拒绝。

## 注意事项

- 本文件只有类型，没有运行时逻辑；数据类型的规范定义与语义见 `docs/modules/shared/editRevertPlan.md`。
- 修改 port 方法签名时必须同步 `EditRevertService`、`ChatPluginPort`（`editRevertService` 字段）与 `docs/modules/shared/editRevertPlan.md`。
