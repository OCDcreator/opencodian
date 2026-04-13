# OpenCodeEventSubscriptionCoordinator

> **源码**: `src/core/opencode/OpenCodeEventSubscriptionCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeEventSubscriptionCoordinator` 是 `OpenCodeService` 内部的 open-code event runtime owner。它把 `event.subscribe()` / `global.event()` 相关的 listener registry、wanted state、双流订阅生命周期、catalog-relevant payload routing 与 emit path 收束到同一个较厚 coordinator，避免这些状态机继续铺在 `OpenCodeService` 主门面里。

它不承接 tool/MCP catalog state 本身；registry tool ids、tool schema cache、MCP server status snapshot 仍留在 `OpenCodeService`，本模块只负责在事件流里触发相应的 runtime 观察与 catalog listener emit。

## 导入关系

```text
上游:
- `../../shared`
- `./sdkTypes`
- `./types`

下游:
- `src/core/opencode/OpenCodeService`
- 单元测试
```

## 核心类型 / 接口

- `OpenCodeEventListener`: 对外转发的 OpenCode SDK event envelope listener。
- `CatalogUpdateListener`: capability snapshot listener，给设置页/视图消费 tool/MCP catalog 更新。
- `OpenCodeEventSubscriptionCoordinatorHost`: host seam，提供按 source 订阅 SDK events、runtime tool 观察、MCP status refresh、capability snapshot、日志与 delay。
- `OpenCodeEventSubscriptionCoordinator`: 持有 open-code event / catalog listener registry、`event` / `global` 两路订阅状态和 payload routing。

## 核心逻辑

### Listener registry

两类公开订阅都收口在本 coordinator：

- `subscribeToOpenCodeEvents()`
- `subscribeToCatalogUpdates()`

任一 listener 注册后会标记 `wanted = true` 并确保 `event` 与 `global` 两路 SDK 订阅存在；最后一个 listener 释放后会中断两路 stream。

### Subscription lifecycle

`ensureSubscriptions()` 只在存在 listener 且当前 source 没有活跃 promise 时启动 loop。`stopSubscriptions(keepWanted)` 在 settings 或 vault scope 切换时只负责中断当前订阅，可选择保留 wanted state。`restartSubscriptions()` 用于受控重启两路 stream，同时保留 listener registry。

每个 source 都维持自己的 `AbortController` 与 promise；某一路结束或失败时只重建该 source，不影响另一条仍在运行的 loop。

### Event routing

coordinator 会兼容 direct payload 和嵌套在 `{ payload }` 里的 SDK envelope payload，并保持原有 catalog-relevant 语义：

- `mcp.tools.changed` → 触发 host `refreshMcpServerStatus()`
- `message.part.updated` 中的 tool part → 观察 runtime tool 名
- `message.updated` 中的 `info.tools` → 观察 runtime tool 名
- `permission.asked` → 观察 permission 对应的 tool 名

所有原始 envelope 仍会原样透传给 `OpenCodeService.subscribeToOpenCodeEvents()` 的 listener。

### Catalog emit path

`emitCatalogUpdate()` 通过 host 的 `getCapabilitySnapshot()` 读取当前 catalog / MCP 快照，再统一广播给 catalog listeners。真正的 catalog state 仍在 `OpenCodeService` 中更新；本 coordinator 只持有监听与广播职责。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `subscribeToOpenCodeEvents()` | 注册 OpenCode SDK event listener，并按需启动 `event` / `global` loop |
| `subscribeToCatalogUpdates()` | 注册 capability snapshot listener，立即回放当前 snapshot |
| `hasListeners()` | 供 `OpenCodeService.updateSettings()` 判断是否需要保留 wanted state |
| `ensureSubscriptions()` | 确保双路 OpenCode event 订阅存在 |
| `stopSubscriptions()` | 中断双路订阅，可选择保留 wanted state |
| `restartSubscriptions()` | 在 directory/settings scope 改变时重启订阅 |
| `emitCatalogUpdate()` | 广播当前 capability snapshot 给 catalog listeners |

## 数据流

```mermaid
graph TD
    A[OpenCodeService public subscribe API] --> B[OpenCodeEventSubscriptionCoordinator]
    B --> C[OpenCodeService host seam]
    C --> D[OpenCodeSdkFacade event / global.event]
    D --> E[OpenCode Server event streams]
    E --> B
    B --> F[OpenCode event listeners]
    B --> G[catalog update listeners]
```

## 与其他模块的交互

- `OpenCodeService` 继续作为对外总门面，负责创建 coordinator、维护 catalog state，并提供 host seam。
- `OpenCodeSdkFacade` 仍集中 SDK client options injection；coordinator 不直接创建客户端。
- R21 计划中的 catalog state store 还未迁出，因此本模块不会接管 tool schema cache 或 MCP status map。

## 配置项

无独立配置项。是否订阅由 listener registry 与 `OpenCodeService` 当前 server/baseUrl scope 决定。

## 注意事项

- 不要把 open-code event listener 与 catalog listener 再拆成更薄的 service；它们共享 wanted state 和双路 SDK stream 生命周期。
- 不要在这里混入 tool/MCP catalog state store、prompt request builder、streaming runtime 或 message normalization；这些属于后续 maintainability queue。
- `refreshMcpServerStatus()` 仍走 host seam，确保 catalog state 更新和对外 API 语义继续留在 `OpenCodeService`。
