# Command Scoped Agent Helpers

> **源码**: `src/core/config/commandScopedAgent.ts`
> **状态**: [REVIEW]

## 概述

`commandScopedAgent.ts` 负责把 slash command 的采样参数（`temperature` / `top_p`）转成 OpenCode 原生 agent 配置。它避免把采样字段直接写进 command 配置，而是为指定 command 生成隐藏的 `opencodian-command:<commandId>` agent，并在 command 上引用该 agent。

## 导入关系

```text
上游: src/core/types, src/core/config/modelConfig
下游: src/core/config/OpencodeConfigManager.ts, src/core/config/slashCommandCatalog.ts, 相关单元测试
```

## 核心导出

| 导出 | 说明 |
|------|------|
| `COMMAND_SCOPED_AGENT_KIND` | 写入 agent metadata 的类型标记：`slash-command-sampling` |
| `COMMAND_SCOPED_AGENT_OPTIONS_KEY` | metadata 在 agent `options` 中的键名 |
| `getCommandScopedAgentId()` | 根据 command id 生成隐藏 agent id |
| `isCommandScopedAgentId()` | 判断字符串是否为 OpenCodian 生成的 command-scoped agent |
| `getCommandScopedAgentMetadata()` | 从 agent options 中读取指定 command 的 metadata |
| `prepareCommandPatchWithScopedAgent()` | 主入口：把 command 采样 patch 转成 command + native agent patch |
| `removeCommandScopedAgent()` | 删除指定 command 对应的隐藏 agent |

## 核心逻辑

### 采样字段剥离

`prepareCommandPatchWithScopedAgent()` 先复制 command patch，然后删除 `temperature` 与 `top_p`。如果本次 patch 没有这两个字段，就直接返回剥离后的 command patch。

### 隐藏 agent 生成

当 `temperature` 或 `top_p` 有有效数值时，模块会：

- 解析 command 当前或既有的 base agent
- 克隆 base agent 或既有 scoped agent
- 写入隐藏 agent metadata：`kind`、`commandId`、可选 `baseAgent`
- 把 `hidden` 设为 `true`
- 根据 command `subtask` 推导默认 `mode`
- 将 command 的 `agent` 指向 `opencodian-command:<commandId>`

### 清理逻辑

如果采样字段被清空，且 command 当前引用的是对应隐藏 agent，模块会把 command `agent` 置空并删除 native agent map 中的 scoped agent。

## 数据流

```text
设置页 / config patch
  → OpencodeConfigManager
  → prepareCommandPatchWithScopedAgent()
  → command patch 移除 sampling 字段
  → nativeAgents 写入或删除隐藏 scoped agent
  → .opencode/opencode.json 保存 command + agent 配置
```

## 与其他模块的交互

- `OpencodeConfigManager.ts` 使用该模块保存 command-scoped sampling。
- `slashCommandCatalog.ts` 使用 `getCommandScopedAgentMetadata()` 识别 OpenCodian 生成的隐藏 agent。
- `SettingsCommandsSection.test.ts` 与 `OpencodeConfigManager.commandScopedAgent.test.ts` 覆盖此行为。

## 配置项

无用户直接配置项；它操作的是 OpenCode command / agent 配置结构。

## 注意事项

- 不要把 `temperature` / `top_p` 直接留在 command patch 中，否则会破坏当前“采样归属隐藏 agent”的配置边界。
- scoped agent id 以 `opencodian-command:` 开头；外部手写 agent 不应使用此前缀。
- metadata 校验同时检查 `kind` 与 `commandId`，避免误把其他 agent 当成 OpenCodian 生成项。
