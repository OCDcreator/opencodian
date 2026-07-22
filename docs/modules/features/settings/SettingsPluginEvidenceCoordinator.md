# SettingsPluginEvidenceCoordinator

> **源码**: `src/features/settings/SettingsPluginEvidenceCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`SettingsPluginEvidenceCoordinator` 是 Settings > Plugins 页面与 SDK 1.18.3 plugin evidence 流之间的稳定非 DOM lifecycle/transport owner。

它的职责边界刻意保持在“Settings 侧最小 SDK transport 适配”：

- 复用 `getServerBaseUrl`、vault path normalize 与 `OpenCodeSdkFacade` 构造独立的 directory-scoped SDK facade
- 为 `OpenCodeEventSubscriptionCoordinator` 提供 `OpenCodePluginEvidenceObserver` 对象（`onPluginEvidence`、`getConnectionSignature`、`fetchPluginConfig`）
- 通过既有 `OpenCodeService.subscribeToOpenCodeEvents()` 注册 observer，而不是要求 Service 新增 plugin evidence 公开方法
- 暴露 `subscribe()`、`refresh()`、`getSnapshot()`、`dispose()` 四个轻量方法，供 `SettingsPluginSection` 管理订阅/刷新生命周期

它不拥有 plugin evidence state；所有 effective config、runtime evidence、fetch state 与 transport state 仍由 `OpenCodeEventSubscriptionCoordinator` 持有。

## 导入关系

```text
上游:
- `src/core/opencode/OpenCodeSdkFacade`
- `src/core/opencode/OpenCodeService`
- `src/core/opencode/OpenCodeEventSubscriptionCoordinator`（observer / handle 类型）
- `src/core/types/settings`
- `src/shared/contextPath`

下游:
- `src/features/settings/SettingsPluginSection`
```

## 核心类型 / 接口

- `SettingsPluginEvidenceCoordinatorOptions`: 构造参数，包含 `openCodeService`、`getSettings` 与 `vaultPath`。
- `SettingsPluginEvidenceCoordinator`: 构造独立的 SDK facade，缓存 facade 实例直到 server/auth/directory identity 变化，并通过 observer 回调接入 event coordinator。

## 核心逻辑

### Facade 缓存与 identity

`getFacade()` 只在以下 identity key 变化时才重新创建 `OpenCodeSdkFacade`：

```text
<baseUrl>|<auth-key>|<scoped-directory>
```

key 不变时复用同一 facade 实例，保证 `getConnectionSignature()` 的 opaque generation 稳定，避免同一 Settings 会话内无意义的 stale 标记。

### Observer 生产路径

`subscribe()` 创建的 observer 对象包含：

- `onPluginEvidence`: Settings 传入的渲染回调
- `getConnectionSignature`: 委托 `facade.getConnectionSignature()`
- `fetchPluginConfig`: 委托 `facade.config.get()`

该对象通过 `openCodeService.subscribeToOpenCodeEvents(observer)` 交给 `OpenCodeEventSubscriptionCoordinator`。coordinator 识别对象形态后，把它注册为 plugin evidence listener 与 transport callback owner；返回的 dispose function 同时附带 `getPluginEvidenceSnapshot()` 与 `refreshPluginConfigEvidence()`。

### 生命周期

- `subscribe()` 会先把旧订阅 `dispose()`，再建立新订阅；Settings tab 重建时不会泄漏 listener。
- `dispose()` 取消订阅并清空 facade 缓存。
- `refresh()` 与 `getSnapshot()` 仅在已订阅时转发到底层 handle；未订阅时返回 `null`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `subscribe(onEvidence)` | 创建 observer 并通过 `OpenCodeService.subscribeToOpenCodeEvents()` 注册 |
| `refresh()` | 调用 handle 的 `refreshPluginConfigEvidence()`，刷新 SDK effective config evidence |
| `getSnapshot()` | 调用 handle 的 `getPluginEvidenceSnapshot()`，返回当前防御性快照 |
| `dispose()` | 取消订阅并清空 facade 缓存 |

## 与其他模块的交互

- `SettingsPluginSection.ts`: 创建并持有 coordinator，在 overview 挂载/刷新/处置时调用其方法。
- `OpenCodeService.ts`: 仅作为 `subscribeToOpenCodeEvents` 的转发门面；Service 源文件未因 plugin evidence 功能新增方法或状态。
- `OpenCodeEventSubscriptionCoordinator.ts`: 仍是 plugin evidence 状态的唯一 owner；coordinator 通过 observer 对象获得 transport callbacks。
- `OpenCodeSdkFacade.ts` / `createSdkClient.ts`: 由本 coordinator 直接用于构造 directory-scoped `config.get()` facade。

## 配置项

无独立配置项。构造参数中的 `getSettings` 使 coordinator 能动态读取当前 server URL、auth 与 vault path。

## 注意事项

- 不要在这个 coordinator 里缓存或派生 effective/runtime evidence state；它只负责 transport 适配与订阅生命周期。
- facade 的 identity key 必须包含 auth 与 directory，否则 server/vault 切换后仍会得到旧 generation，导致 stale 语义错误。
- 远程模式下仍然只读 `sdk.config.get()`，不调用 `sdk.config.update()`；本地文件写入仍由 `PluginManagementService` 负责。
