# OpenCode Service Types

> **源码**: `src/core/opencode/types.ts`
> **状态**: [REVIEW]

## 概述

`types.ts` 定义的是 `core/opencode` 这一层的服务契约类型。它不描述 OpenCode 持久化 message 的内部结构，也不承担 SDK v2 类型别名工作；它关注的是：

- `OpenCodeService` 对上暴露的方法参数/返回值
- server 连接与运行配置
- 与聊天上下文、权限、流式输出有关的输入类型

## 导入关系

```text
上游:
- `src/core/types/chat.ts`
- `src/core/types/settings.ts`
- `./sdkFeatureFlags`

下游:
- `src/core/opencode/OpenCodeService`
- `src/core/opencode/index`
```

## 公开类型

### `ResponseHandler`

```ts
interface ResponseHandler {
  id: string;
  onChunk: (chunk: StreamChunk) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}
```

这是 callback 风格的流式处理接口定义。当前 `OpenCodeService` 仍保留了 `responseHandlers` 私有字段，但主公开流式 API 实际上已经转向 `AsyncGenerator<StreamChunk>`。

### `ServerStatus`

```ts
'stopped' | 'starting' | 'running' | 'error' | 'restarting'
```

这是服务层对外可见的 server 状态联合类型。`ServerManager.ts` 里还有一个同形的本地 `ServerStatus`，两者语义一致，但定义位置不同。

### `ServerError`

```ts
interface ServerError {
  code: string;
  message: string;
  recoverable: boolean;
}
```

当前 Worker 1 范围里，这个类型主要是对外暴露的服务层错误形状定义，本文件本身不提供构造逻辑。

### `QueryOptions`

`QueryOptions` 是发送 prompt 时最关键的输入类型，字段包括：

| 字段 | 说明 |
|------|------|
| `sessionId?` | 目标 session；不传时服务层会回退到 `currentSessionId` |
| `model?` / `provider?` | 显式指定模型 |
| `images?` | 图片附件 |
| `contextItems?` | 显式 Obsidian 上下文条目 |
| `allowedTools?` | 允许的工具列表 |
| `externalContextPaths?` | 旧字段，服务层目前会忽略 |
| `reasoningEffort?` | 推理强度 |
| `thinkingBudget?` | thinking token 预算 |

### `OpenCodeServerConfig`

这是 `ServerManager` 的运行配置：

| 字段 | 说明 |
|------|------|
| `mode` | 本地 / 远程 |
| `baseUrl` | 目标服务地址 |
| `local` | 本地 host / port / autoStart |
| `auth` | basic / bearer / none |
| `modelSourceMode` | server / merge / 本地 project config 相关模式 |
| `pluginIsolationMode` | 是否 pure |
| `timeout?` | 启动或健康检查超时 |

### `OpenCodeClientConfig`

```ts
interface OpenCodeClientConfig {
  baseUrl: string;
  fetch?: typeof fetch;
}
```

这是 SDK/HTTP 客户端最小连接配置，不包含更高层的 server 模式或模型来源设置。

### `ManagedServerState`

```ts
interface ManagedServerState {
  pid: number;
  host: string;
  port: number;
}
```

用于记录并恢复插件曾经启动过的 OpenCode 进程。

### `SdkFeatureFlags`

本文件最后重新导出了 `SdkFeatureFlags`，方便调用方从 `core/opencode/types` 或 barrel 间接拿到 SDK rollout 类型。

## 核心逻辑

无运行时逻辑。该文件只提供类型。

## 数据流

```text
settings/chat types -> core/opencode/types.ts -> OpenCodeService / ServerManager / barrel
```

## 与其他模块的交互

- `OpenCodeService` 用这里的 `QueryOptions`、`ResponseHandler`、`OpenCodeServerConfig`、`ManagedServerState` 做方法签名和内部协作。
- `ServerManager` 直接消费 `OpenCodeServerConfig` 和 `ManagedServerState`。
- `index.ts` 通过这里向上层重导出服务层类型。

## 配置项

无独立配置项；这里定义的是配置类型，而不是配置值。

## 注意事项

- `QueryOptions.externalContextPaths` 仍在类型里，但 `OpenCodeContextPartSerializer.buildPromptRequestParts()` 当前会忽略它。
- `reasoningEffort` / `thinkingBudget` 的实际下发方式由 `OpenCodeService` 决定，不由此文件约束。
- `ServerStatus` 在 `ServerManager.ts` 里也定义了一份同形联合类型；修改状态集合时需要同步。
