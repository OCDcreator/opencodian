# Shared Barrel

> **源码**: `src/shared/index.ts`
> **状态**: [REVIEW]

## 概述

共享工具层的主聚合入口。它把日志、Obsidian 上下文解析、工具身份归一化、工具执行状态解析和 vault 路径工具统一暴露给主功能层使用，是多个 feature 与 core 模块都依赖的横切工具入口。

## 导入关系

```text
上游: ./debugModules, ./logger, ./obsidianContext, ./toolIdentity, ./toolExecution, ./vault
下游: features/chat/*, features/settings/*, main.ts, 测试代码
```

## 核心类型 / 接口

```typescript
export type { LogChannel, LogEntry, Logger } from './logger';
export {
  clearRecentLogs,
  createLogger,
  getDebugModuleSettings,
  getDebugRefreshIntervalMs,
  getClaudeCodeDebugChannelSettings,
  getRecentLogEntries,
  getRecentLogText,
  getRecentLogTextForEntries,
  resetLogEmissionThrottleState,
  setClaudeCodeDebugChannelSettings,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
  setDebugModuleSettings,
  setDebugRefreshIntervalMs,
  setInlineSerializedDebugLogArgsEnabled,
  shouldEmitLogFingerprint,
} from './logger';
export {
  buildContextAttachment,
  buildObsidianContextTag,
  dedupeContextAttachments,
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
export type { ToolIdentity, ToolIdentityKind, ToolIdentityOptions } from './toolIdentity';
export { getNormalizedToolName, getToolIdentity, isBuiltinToolName } from './toolIdentity';
export { getVaultBasePath } from './vault';
```

## 核心逻辑

### 横切能力聚合

该 barrel 收口多类通用工具，避免业务层分别深入 `shared/logger`、`shared/obsidianContext` 等路径。虽然聚合面较宽，但导出内容都偏底层辅助能力，不包含 feature-specific 逻辑。诊断密钥净化器（`diagnosticSecretSanitizer`）独立于 Obsidian API，被导出路径复用。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `createLogger()` | 生成带前缀日志器 |
| `clearRecentLogs()` | 清空最近诊断日志缓存 |
| `getDebugModuleSettings()` / `setDebugModuleSettings()` | 读取/写入模块级调试开关 |
| `getClaudeCodeDebugChannelSettings()` / `setClaudeCodeDebugChannelSettings()` | 读取/写入 Claude Code 细分调试通道 |
| `setDebugModuleEnabled()` | 切换单个 debug module 开关 |
| `getDebugRefreshIntervalMs()` / `setDebugRefreshIntervalMs()` | 读取/写入高频日志刷新间隔 |
| `getRecentLogEntries()` / `getRecentLogText()` / `getRecentLogTextForEntries()` | 获取最近日志条目或格式化全部/已过滤日志文本 |
| `resetLogEmissionThrottleState()` / `shouldEmitLogFingerprint()` | 共享高频日志指纹去重与节流 |
| `setDebugLoggingEnabled()` | 启用/禁用 debug 级别日志 |
| `setInlineSerializedDebugLogArgsEnabled()` | 控制 debug 日志是否把对象参数内联序列化 |
| `buildObsidianContextTag()` | 构建 `<obsidian_context>` XML 标签 |
| `parseObsidianContextTag()` | 解析标签为 `MessageContextAttachment` |
| `buildContextAttachment()` | `PromptContextItem` → `MessageContextAttachment` |
| `dedupeContextAttachments()` | 按 kind/path/line-range 去重上下文附件 |
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
| `getToolIdentity()` | 统一解析工具种类、显示名和图标 |
| `getNormalizedToolName()` | 获取工具规范名 |
| `isBuiltinToolName()` | 判断是否属于内置/特殊内建工具 |
| `getVaultBasePath()` | 解析当前 vault 根路径 |
| `sanitizeDiagnosticReport()` | 诊断报告导出前的密钥/令牌/密码净化 |

## 数据流

不适用。该模块本身不产生单一数据流，而是被多条业务流程横向复用。

## 与其他模块的交互

- 被聊天、设置和主入口广泛依赖
- 各具体实现文档见 [brandingWordmark.md](brandingWordmark.md)、[debugModules.md](debugModules.md)、[diagnosticSecretSanitizer.md](diagnosticSecretSanitizer.md)、[logger.md](logger.md)、[obsidianContext.md](obsidianContext.md)、[toolIdentity.md](toolIdentity.md)、[toolExecution.md](toolExecution.md)、[vault.md](vault.md)

## 配置项

无直接配置。

## 注意事项

- barrel 容易越长越杂，新增导出时应确认它确实属于"全局共享工具"
- 改动这里的导出面影响范围通常较广
