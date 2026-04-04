# Shared Barrel

> **源码**: `src/shared/index.ts`
> **状态**: [DRAFT]

## 概述

共享工具层的主聚合入口。它把日志、Obsidian 上下文解析、工具执行状态解析和 vault 路径工具统一暴露给主功能层使用，是多个 feature 与 core 模块都依赖的横切工具入口。

## 导入关系

```text
上游: ./logger, ./obsidianContext, ./toolExecution, ./vault
下游: features/chat/*, features/settings/*, main.ts, 测试代码
```

## 核心类型 / 接口

```typescript
export type { Logger } from './logger';
export { createLogger, getRecentLogEntries, getRecentLogText, setDebugLoggingEnabled } from './logger';
export { buildContextAttachment, formatContextLabel, parseObsidianContextTag, ... } from './obsidianContext';
export type { ToolExecutionStateLike, ToolExecutionStatus } from './toolExecution';
export { isToolExecutionError, resolveToolExecutionStatus, resolveToolResultText } from './toolExecution';
export { getVaultBasePath } from './vault';
```

## 核心逻辑

### 横切能力聚合

该 barrel 收口多类通用工具，避免业务层分别深入 `shared/logger`、`shared/obsidianContext` 等路径。

### 共享而不混业务

虽然聚合面较宽，但导出内容都偏底层辅助能力，不包含 feature-specific 逻辑。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `createLogger()` | 生成带前缀日志器 |
| `buildContextAttachment()` 等 | 上下文附件与 Obsidian tag 解析辅助 |
| `resolveToolExecutionStatus()` | 工具执行状态归一化 |
| `getVaultBasePath()` | 解析当前 vault 根路径 |

## 数据流

不适用。该模块本身不产生单一数据流，而是被多条业务流程横向复用。

## 与其他模块的交互

- 被聊天、设置和主入口广泛依赖
- 各具体实现文档见 [logger.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/shared/logger.md)、[obsidianContext.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/shared/obsidianContext.md)、[toolExecution.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/shared/toolExecution.md)、[vault.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/shared/vault.md)

## 配置项

无直接配置。

## 注意事项

- barrel 容易越长越杂，新增导出时应确认它确实属于“全局共享工具”
- 改动这里的导出面影响范围通常较广

## 待补充

- [ ] 统计最常用的 shared 导出项

