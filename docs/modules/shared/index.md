# Shared Barrel

> **源码**: `src/shared/index.ts`
> **状态**: [REVIEW]

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
export {
  createLogger,
  getRecentLogEntries,
  getRecentLogText,
  setDebugLoggingEnabled,
  setInlineSerializedDebugLogArgsEnabled,
} from './logger';
export {
  buildContextAttachment,
  buildObsidianContextTag,
  formatContextLabel,
  formatLineRange,
  getContextPathExtension,
  isEligibleContextFilePath,
  isHiddenContextPath,
  isTextLikeMime,
  parseLineRangeFromFileUrl,
  parseObsidianContextTag,
  resolveContextMimeFromPath,
  resolveTextMimeFromPath,
  toFileContextUrl,
} from './obsidianContext';
export type { ToolExecutionStateLike, ToolExecutionStatus } from './toolExecution';
export { isToolExecutionError, resolveToolExecutionStatus, resolveToolResultText } from './toolExecution';
export { getVaultBasePath } from './vault';
```

## 核心逻辑

### 横切能力聚合

该 barrel 收口多类通用工具，避免业务层分别深入 `shared/logger`、`shared/obsidianContext` 等路径。虽然聚合面较宽，但导出内容都偏底层辅助能力，不包含 feature-specific 逻辑。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `createLogger()` | 生成带前缀日志器 |
| `getRecentLogEntries()` / `getRecentLogText()` | 获取最近日志条目或格式化文本 |
| `setDebugLoggingEnabled()` | 启用/禁用 debug 级别日志 |
| `setInlineSerializedDebugLogArgsEnabled()` | 控制 debug 日志是否把对象参数内联序列化 |
| `buildObsidianContextTag()` | 构建 `<obsidian_context>` XML 标签 |
| `parseObsidianContextTag()` | 解析标签为 `MessageContextAttachment` |
| `buildContextAttachment()` | `PromptContextItem` → `MessageContextAttachment` |
| `resolveContextMimeFromPath()` | 路径 → MIME 类型 |
| `resolveTextMimeFromPath()` | 路径 → 文本 MIME（非文本回退 `text/plain`） |
| `isTextLikeMime()` | 检查是否为文本类 MIME |
| `formatLineRange()` / `formatContextLabel()` | 行范围与上下文标签格式化 |
| `getContextPathExtension()` | 从路径提取文件扩展名 |
| `isHiddenContextPath()` / `isEligibleContextFilePath()` | 路径可见性与可用性判断 |
| `toFileContextUrl()` / `parseLineRangeFromFileUrl()` | `file:///` URL 与行范围双向转换 |
| `resolveToolExecutionStatus()` | 工具执行状态归一化 |
| `isToolExecutionError()` | 判断是否为错误状态 |
| `resolveToolResultText()` | 统一获取工具结果文本 |
| `getVaultBasePath()` | 解析当前 vault 根路径 |

## 数据流

不适用。该模块本身不产生单一数据流，而是被多条业务流程横向复用。

## 与其他模块的交互

- 被聊天、设置和主入口广泛依赖
- 各具体实现文档见 [logger.md](logger.md)、[obsidianContext.md](obsidianContext.md)、[toolExecution.md](toolExecution.md)、[vault.md](vault.md)

## 配置项

无直接配置。

## 注意事项

- barrel 容易越长越杂，新增导出时应确认它确实属于"全局共享工具"
- 改动这里的导出面影响范围通常较广
