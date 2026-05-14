# Core Types Barrel

> **源码**: `src/core/types/index.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 全局类型的主聚合入口。它把聊天、模型、设置、权限、OpenCode 配置等分散类型统一导出，供主视图、设置面板、服务层和工具层使用，是整个项目最重要的类型入口之一。

## 导入关系

```text
上游: ./chat, ./models, ./settings, ./tools, ./permission, ./opencodeConfig
下游: 几乎所有业务模块，尤其是 main.ts、OpenCodianView、OpenCodeService、设置 UI
```

## 核心导出

### 来自 `./chat`

| 导出 | 类型 | 说明 |
|------|------|------|
| `ChatMessage` | type | 聊天消息结构 |
| `CompactionDividerMeta` | type | 结构化 compaction 分界元数据 |
| `ContentBlock` | type | 内容块（text/thinking/tool_use/tool_result/subagent） |
| `BackgroundTaskActiveAnchorMetadata` | type | background-task active anchor 的轻量 lifecycle 缓存字段 |
| `Conversation` | type | 完整会话（含消息数组） |
| `ConversationBackgroundTaskMetadata` | type | 会话级 background-task lifecycle 恢复缓存；不承载消息内容真值 |
| `ConversationMeta` | type | 会话元数据 |
| `StreamChunk` | type | 流式事件联合类型（13 种事件） |
| `TabContextState` | type | 标签页上下文状态 |
| `createEmptyTabContextState` | function | 创建空白上下文状态 |
| `UsageInfo` | type | Token 使用信息 |
| `ImageAttachment` | type | 图片附件 |
| `ToolCallInfo` | type | 工具调用信息 |
| `QuestionRequest` | type | OpenCode 问题请求 |
| `QuestionResolution` | type | 问题解决状态 |
| `SessionTodo` | type | 会话待办项 |
| `SessionDiffEntry` | type | 会话差异条目 |
| `OmoMessageMeta` | type | OMO 消息元数据 |
| `VIEW_TYPE_OPENCODIAN` | const | 视图类型常量 `'opencodian-view'` |

### 来自 `./models`

| 导出 | 类型 | 说明 |
|------|------|------|
| `ModelInfo` | type | 模型信息 |
| `ModelProvider` | type | 模型提供商 |
| `getDefaultContextWindow` | function | 获取模型默认上下文窗口 |

### 来自 `./settings`

| 导出 | 类型 | 说明 |
|------|------|------|
| `OpenCodianSettings` | type | 完整设置接口 |
| `DEFAULT_SETTINGS` | const | 默认设置常量 |
| `ServerMode` / `ServerAuthType` | type | 服务器模式/认证类型 |
| `ServerConfig` / `LocalServerConfig` / `RemoteServerConfig` | type | 服务器配置 |
| `PermissionMode` / `ApprovalDecision` | type | 权限模式/审批决策 |
| `ModelSourceMode` | type | 模型来源模式 |
| `TitleMode` | type | 标题生成模式 |
| `QuestionDisplayMode` / `QuestionCardPosition` | type | 问题显示配置 |
| `TabBarPosition` / `BelowHeaderTabBarLayout` | type | 标签栏配置 |
| `ChatScrollMode` | type | 滚动模式 |
| `InputPanelThemeId` / `LiquidGlassAdapterId` | type | 输入面板主题 |
| `ContextRingStyleId` | type | 上下文圆环样式 |
| `ChatAppearanceSettings` | type | 聊天外观设置 |
| `ThemeSettings` / `ThemePresetId` / `ThemeStyleId` | type | 主题设置 |
| `PersistedTabState` / `PersistedTabEntry` | type | 标签页持久化 |
| `ProviderIconEntry` / `ProviderIconLibrary` | type | 提供商图标 |
| `normalize*` 系列 | function | 归一化函数（约 20+ 个） |
| `getDefault*` 系列 | function | 默认值函数 |
| `isLocalServerMode` / `getServerBaseUrl` | function | 服务器工具函数 |

### 来自 `./tools`

| 导出 | 类型 | 说明 |
|------|------|------|
| `ToolCallInfo` | type | 工具调用信息 |

### 来自 `./permission`

| 导出 | 类型 | 说明 |
|------|------|------|
| `PermissionAction` / `ToolPermission` | type | 权限动作 |
| `PermissionConfig` | type | 权限配置 |
| `PermissionRequest` / `PermissionReplyInput` | type | 权限请求/响应 |
| `PermissionSettings` | type | 权限设置 |
| `PermissionMode` | type | 权限模式 |
| `OpencodeConfig` | type | OpenCode 配置（交叉引用） |

### 来自 `./opencodeConfig`

| 导出 | 类型 | 说明 |
|------|------|------|
| `OpencodeAgentConfig` / `OpencodeAgentConfigRecord` | type | agent 配置与按 ID 聚合的 map |
| `OpencodeCommandConfig` / `OpencodeCommandConfigRecord` | type | slash command 配置与按名称聚合的 map |
| `OpencodeCompactionConfig` | type | 会话压缩配置 |
| `OpencodeFormatterEntryConfig` / `OpencodeFormatterConfig` / `OpencodeFormatterStatus` | type | formatter 条目、项目级 formatter 配置与运行时 formatter 状态 |
| `OpencodeMcpConfigRecord` / `OpencodeMcpEntryConfig` / `OpencodeMcpOAuthConfig` / `OpencodeMcpTransportType` | type | 项目级 MCP server 配置、entry、OAuth 子配置和 transport 类型 |
| `OpencodeProviderConfig` | type | 提供商配置 |
| `OpencodeProviderModelConfig` | type | 模型配置 |
| `OpencodePluginSpec` | type | 插件声明格式 |
| `OpencodeModelConfigSubset` | type | 模型配置子集 |
| `OpencodeShareMode` | type | 顶层 share 模式（`manual` / `auto` / `disabled`） |
| `OpencodeToolConfig` | type | top-level 工具开关配置 |

## 核心逻辑

### 类型分组聚合

该文件按主题分组 re-export：

- **chat**: 消息、会话、流式事件、上下文附件、OMO 元数据、待办、差异
- **models**: 模型提供商与上下文窗口信息
- **settings**: 默认设置、normalize 工具、主题与服务器配置（约 40+ 个字段）
- **tools**: 工具调用数据结构
- **permission**: 权限请求与审批结构
- **opencodeConfig**: 本地 OpenCode 配置文件 schema，以及 agent / command / share / compaction / formatter / MCP / legacy tools typing

### 为上层提供稳定类型入口

调用方通常只需 `import { ... } from '../../core/types'`，而不用深入每个子文件。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `createEmptyTabContextState()` | 从 chat 类型模块暴露的上下文状态初始化函数 |
| `DEFAULT_SETTINGS` | 从 settings 模块暴露的默认配置常量 |
| `getDefaultChatAppearanceSettings()` 等 | 多组默认值与 normalize 工具 |
| `normalizeEffortLevel()` 等 | 设置值归一化函数 |
| 各类 `type` 导出 | 项目核心类型契约 |

## 数据流

不适用。该模块本身不参与运行时数据处理，但它定义了多条运行时数据流共享的类型边界。

## 与其他模块的交互

- 是 [chat.md](./chat.md)、[models.md](./models.md)、[settings.md](./settings.md) 等子文档的聚合入口
- 与 `core/tools/index.ts` 共同提供"类型 + 常量"层的公开 API
- 被 `main.ts`、`OpenCodianView`、`OpenCodeService`、`OpenCodianSettings` 等几乎所有模块导入

## 配置项

无。

## 注意事项

- 这是高耦合入口，新增导出时要警惕循环依赖和 import 体积膨胀
- 这里既导出类型也导出函数/常量，消费方需区分使用场景
- 源码约 156 行，但聚合了数千行的类型定义

## 消费统计

最常被消费的导出分组（按出现频率估计）：
1. `chat` 相关（`ChatMessage`, `StreamChunk`, `Conversation`）— 聊天核心
2. `settings` 相关（`OpenCodianSettings`, `DEFAULT_SETTINGS`, `normalize*`）— 设置系统
3. `permission` 相关（`PermissionRequest`, `PermissionMode`）— 权限交互
