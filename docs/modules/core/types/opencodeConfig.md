# OpenCode Config Schema Types

> **源码**: `src/core/types/opencodeConfig.ts`
> **状态**: [REVIEW]

## 概述

定义 `.opencode/opencode.json` 配置文件的 TypeScript 类型映射，涵盖 provider 配置、模型参数、插件数组、结构化 agent / command / compaction / formatter 配置，以及 OpenCode 仍兼容的 deprecated `mode` / top-level `tools` 字段。供 `ModelConfigService` 和 `OpencodeConfigManager` 读写 OpenCode 原生配置时使用。类型设计允许完整配置、provider 级配置与 formatter entry 保留未知字段，同时把 `OpencodeModelConfigSubset` 保持为显式字段列表，便于局部读写模型相关配置。

## 导入关系

上游: `src/core/types/permission.ts`（`PermissionConfig`, `PermissionAction` — 通过 `import()` 类型引用）
下游:
- `src/core/config/ModelConfigService.ts`（读写模型配置）
- `src/core/config/OpencodeConfigManager.ts`（读写完整配置）
- `src/core/config/PluginManagementService.ts`（读写 plugin 数组）
- `src/core/types/permission.ts`（交叉引用）

## 核心类型 / 接口

| 类型 | 说明 |
|------|------|
| `OpencodeProviderModelLimit` | 模型 token 限制（`context?`, `output?`） |
| `OpencodeProviderModelConfig` | 单个模型配置（`name?`, `limit?`, `options?`, `variants?`, `[key: string]: unknown`） |
| `OpencodeProviderConfig` | 提供商配置（`npm?`, `name?`, `options?`, `models?`, `[key: string]: unknown`） |
| `OpencodePluginOptions` | `Record<string, unknown>` — 插件选项 |
| `OpencodePluginSpec` | `string \| [string, OpencodePluginOptions]` — 插件声明格式 |
| `OpencodeAgentMode` | agent 模式（`'primary' \| 'subagent' \| 'all'`） |
| `OpencodeAgentConfig` | 结构化 agent 配置（`description?`, `mode?`, `model?`, `prompt?`, `temperature?`, `top_p?`, `steps?`, `tools?`, `permission?`, `color?`, `hidden?`, `disable?`, `options?`） |
| `OpencodeAgentConfigRecord` | `Record<string, OpencodeAgentConfig>` — 原生 / deprecated agent map |
| `OpencodeCommandConfig` | 结构化命令配置（`template?`, `description?`, `agent?`, `subtask?`, `model?`, `temperature?`, `top_p?`） |
| `OpencodeCommandConfigRecord` | `Record<string, OpencodeCommandConfig>` — 命令 map |
| `OpencodeCompactionConfig` | 压缩配置（`auto?`, `prune?`, `tail_turns?`, `preserve_recent_tokens?`, `reserved?`） |
| `OpencodeFormatterEntryConfig` | 单个 formatter 条目配置（`disabled?`, `command?`, `environment?`, `extensions?`, `[key: string]: unknown`） |
| `OpencodeFormatterConfig` | formatter 配置联合：`false`（全部禁用）或 `Record<string, OpencodeFormatterEntryConfig>`（按 formatter 覆盖） |
| `OpencodeFormatterStatus` | SDK `formatter.status()` 返回的运行时状态（`name`, `extensions`, `enabled`） |
| `OpencodeToolConfig` | `Record<string, boolean>` — top-level 工具开关 |
| `OpencodeModelConfigSubset` | 模型相关配置子集（`model?`, `small_model?`, `provider?`, `enabled_providers?`, `disabled_providers?`） |
| `OpencodeConfig` | 完整配置（继承 ModelConfigSubset + `$schema?`, `permission?`, `plugin?`, `agent?`, `command?`, `default_agent?`, `compaction?`, `formatter?`, deprecated `mode?`, `tools?`, `[key: string]: unknown`） |

## 核心逻辑

### 配置层级

- `OpencodeModelConfigSubset` — 仅模型/提供商相关字段，供 `ModelConfigService` 局部读写
- `OpencodeConfig` — 完整配置，增加 `permission`、`plugin`、`agent`、`command`、`default_agent`、`compaction`、`formatter`、deprecated `mode` / top-level `tools`、`$schema` 等顶层字段

### 插件声明格式

`OpencodePluginSpec` 支持两种写法：
- 字符串：`"plugin-name"` — 纯 npm 包名
- 元组：`["plugin-name", { key: "value" }]` — 带选项的插件

示例：
```json
{
  "plugin": [
    "@scope/example-plugin",
    ["oh-my-opencode", { "profile": "vault" }]
  ]
}
```

### 索引签名

`OpencodeProviderModelConfig`、`OpencodeProviderConfig` 和顶层 `OpencodeConfig` 都带有 `[key: string]: unknown`，确保完整配置读写时不会因未知字段报错；`OpencodeModelConfigSubset` 则只保留固定字段集合。这使得配置可以：
- 在完整配置层保留 OpenCode 新增但插件暂未识别的字段
- 允许用户在 provider / model / 顶层配置上添加扩展字段
- 同时让模型子集提取与回写保持可控边界

### 模型变体

`OpencodeProviderModelConfig.variants` 支持同一模型的不同变体配置：
```typescript
{
  "gpt-4": {
    "variants": {
      "fast": { "options": { "temperature": 0.5 } },
      "creative": { "options": { "temperature": 0.9 } }
    }
  }
}
```

## 关键方法

无运行时方法，仅类型导出。源码约 80 行。

## 2026-04-23 Compaction config alignment

Ownership facts:

1. Compaction config is project-scoped and stored in `.opencode/opencode.json`.
2. Conversation session settings and plugin settings are no longer the source of truth for compaction; this schema models the project-level config object instead.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control, not part of this configuration contract.

## 数据流

1. `OpencodeConfigManager` 读取 `.opencode/opencode.json` → 解析为 `OpencodeConfig`
2. `ModelConfigService` 读取模型子集 → `OpencodeModelConfigSubset`
3. `PluginManagementService` 读写 `plugin` 数组 → `OpencodePluginSpec[]`
4. 写回时保留未知字段（索引签名透传）
5. `mode` / `tools` 继续保留类型，供 `OpencodeConfigManager` 在 native `agent` 辅助读写之外兼容旧项目配置

## 与其他模块的交互

- **ModelConfigService**: 使用 `OpencodeModelConfigSubset` 进行局部配置读写
- **OpencodeConfigManager**: 使用 `OpencodeConfig` 进行完整配置读写
- **PluginManagementService**: 使用 `OpencodePluginSpec` 管理插件列表
- **PermissionConfig**: 通过 `import('./permission').PermissionConfig` 类型引用关联，避免循环依赖

## 配置项

此模块是 OpenCode 配置的类型映射，对应的 JSON 文件为 `.opencode/opencode.json`。

### 配置示例

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "claude-3-5-sonnet-20241022",
  "small_model": "claude-3-5-haiku-20241022",
  "provider": {
    "anthropic": {
      "name": "Anthropic",
      "options": {
        "apiKey": "sk-..."
      },
      "models": {
        "claude-3-5-sonnet-20241022": {
          "name": "Claude 3.5 Sonnet",
          "limit": { "context": 200000, "output": 8192 }
        }
      }
    }
  },
  "enabled_providers": ["anthropic"],
  "default_agent": "build",
  "compaction": {
    "auto": true,
    "reserved": 10000
  },
  "command": {
    "test": {
      "template": "Run the full test suite",
      "agent": "build"
    }
  },
  "permission": { "*": "ask" },
  "plugin": ["oh-my-opencode"],
  "agent": {
    "build": {
      "description": "Primary build agent",
      "mode": "primary",
      "steps": 12
    }
  },
  "mode": {
    "legacy-plan": {
      "description": "Deprecated legacy mode entry"
    }
  },
  "tools": {
    "legacy-tool": false
  }
}
```

### Formatter 三态语义

`formatter` 是 **project-scoped** 的 `.opencode/opencode.json` 字段，并保留 OpenCode 上游的三种语义：

- 字段缺失 / `undefined`：默认模式，由 OpenCode 自动探测 formatter
- `false`：禁用全部 formatter
- `Record<string, OpencodeFormatterEntryConfig>`：自定义模式；空对象 `{}` 表示显式 custom mode 但暂时没有额外 per-formatter override

`OpencodeFormatterEntryConfig` 带有 `[key: string]: unknown`，因此当 OpenCode 将来为 formatter entry 增加新字段时，插件仍能无损 round-trip 这些未知字段。

### command-local sampling patch

`OpencodeCommandConfig` 里的 `temperature?` / `top_p?` 在 OpenCodian 内部表示“命令级 sampling patch”。`OpencodeConfigManager.upsertCommandConfig()` 会消费它们，并把真实持久化落到一个 command-owned hidden agent，而不是把这两个字段长期保留在 native OpenCode `command` schema 里。

## 注意事项

- `permission` 字段类型为 `PermissionConfig | PermissionAction`（联合类型），支持简写形式（如 `permission: "allow"` 等同于所有工具 allow）
- `import()` 类型引用避免了 `opencodeConfig.ts` 和 `permission.ts` 之间的循环依赖
- `models` 使用 `Record<string, OpencodeProviderModelConfig>` 以模型 ID 为 key
- `variants` 支持同一模型的不同变体配置
- `$schema` 字段指向 JSON Schema URL，用于编辑器自动补全

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `$schema` | `string?` | JSON Schema URL |
| `model` | `string?` | 默认模型 ID |
| `small_model` | `string?` | 小模型 ID（用于轻量任务） |
| `provider` | `Record<string, OpencodeProviderConfig>?` | 提供商配置 |
| `enabled_providers` | `string[]?` | 启用的提供商列表 |
| `disabled_providers` | `string[]?` | 禁用的提供商列表 |
| `permission` | `PermissionConfig \| PermissionAction?` | 权限配置 |
| `plugin` | `OpencodePluginSpec[]?` | 插件列表 |
| `agent` | `Record<string, OpencodeAgentConfig>?` | 代理配置 |
| `command` | `Record<string, OpencodeCommandConfig>?` | 命令配置；OpenCodian 会消费 `temperature` / `top_p` patch 并转换成 command-owned hidden agent |
| `default_agent` | `string?` | 默认 primary agent |
| `compaction` | `OpencodeCompactionConfig?` | 压缩配置 |
| `formatter` | `OpencodeFormatterConfig?` | 项目级 formatter 配置；缺失表示默认自动探测，`false` 表示全部禁用，对象表示 per-formatter 覆盖 |
| `mode` | `Record<string, OpencodeAgentConfig>?` | deprecated 旧 agent map，读写 helper 仍会导入 |
| `tools` | `Record<string, boolean>?` | top-level 工具开关，helper 会原样保留 |
