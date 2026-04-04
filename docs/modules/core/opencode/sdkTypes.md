# SDK Type Bridge

> **源码**: `src/core/opencode/sdkTypes.ts`
> **状态**: [REVIEW]

## 概述

`sdkTypes.ts` 不是“类型转换器”，而是一个很薄的 SDK 类型别名层。它的作用是把 `@opencode-ai/sdk/v2/client` 里的常用类型统一改名为 `Sdk*` 前缀，再集中导出给 OpenCodian 其他模块使用。

这个文件没有运行时逻辑，也没有字段级映射函数。

## 导入关系

```text
上游:
- `@opencode-ai/sdk/v2/client`

下游:
- `src/core/opencode/OpenCodeService`
- `src/core/opencode/createSdkClient`
```

## 公开类型

源码当前导出的类型别名如下：

| 本地别名 | 对应 SDK 类型 |
|---------|---------------|
| `SdkAgentPartInput` | `AgentPartInput` |
| `SdkEvent` | `Event` |
| `SdkFilePartInput` | `FilePartInput` |
| `SdkMessage` | `Message` |
| `SdkOpencodeClientConfig` | `OpencodeClientConfig` |
| `SdkOutputFormat` | `OutputFormat` |
| `SdkPart` | `Part` |
| `SdkPermissionRequest` | `PermissionRequest` |
| `SdkSession` | `Session` |
| `SdkSubtaskPartInput` | `SubtaskPartInput` |
| `SdkTextPartInput` | `TextPartInput` |

另外还有两个本地辅助类型：

- `SdkSyncEventStream = { stream: AsyncIterable<unknown> }`
- `SdkOpencodeClient = OpencodeClient`

## 核心逻辑

### SDK import path 收口

当前 `OpenCodeService` 和 `createSdkClient` 都不直接从 SDK 包到处散落地导入类型，而是优先从这个文件取 `Sdk*` 别名。这样做的直接效果是：

- SDK 类型命名在插件内统一
- SDK 包路径集中在一个文件里
- 如果未来 SDK 类型路径变化，改动面更小

### 本地辅助类型补位

`SdkSyncEventStream` 不是 SDK 原生导出，而是当前代码为了表达 `global.syncEvent.subscribe()` 返回值形状额外定义的轻量类型。

## 关键方法

无。该文件只导出类型。

## 数据流

```mermaid
graph LR
    A[@opencode-ai/sdk/v2/client] --> B[sdkTypes.ts]
    B --> C[OpenCodeService]
    B --> D[createSdkClient]
```

## 与其他模块的交互

- `OpenCodeService` 使用这里的 `SdkEvent`、`SdkOpencodeClient` 等类型约束 SDK 调用结果。
- `createSdkClient` 使用 `SdkOpencodeClientConfig` / `SdkOpencodeClient` 做工厂函数签名。

## 配置项

无。

## 注意事项

- 该文件不负责把 SDK message/session/event 转成插件内部 `ChatMessage` / `StreamChunk`；真正的归一化逻辑在 `OpenCodeService.ts`。
- 如果 SDK v2 升级导致类型名或 import path 变化，应优先更新这里，再处理调用方编译错误。
