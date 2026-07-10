# OpenCodeSdkCapabilityDiscoveryCoordinator

> **源码**: `src/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.ts`
> **状态**: [REVIEW]

## 概述

负责 live server discovery：对注册表中每个 entry 先解析 SDK presence，再按 `serverProbe` 策略探测服务端支持，最后通过纯 resolver `resolveCapabilityAvailability` 得到 availability，缓存为不可变 snapshot。它被 `OpenCodeService` 拥有，是 Chat 与 Settings 获取能力真相的唯一入口。

## 核心逻辑

- SDK presence：沿 `sdkPath` 在 facade root 上逐步解析，最终段必须是 function（`typeof === 'function'`）。
- 服务端探测策略：
  - `read`：调用安全只读方法确认 endpoint 存在。
  - `presence`：仅确认 SDK presence，不调用（适用于 stream / 诊断）。
  - `none`：state-changing / experimental entry 绝不作为 probe 调用，server 支持记为 `unknown`。
- 失败分类（脱敏）：抛出 "is unavailable" → `server: false`（→ `unsupported-by-server`）；任何其他失败 → `server: 'unknown'`（→ 永不静默升级为 unsupported）。
- `getSnapshot()` 在无缓存时同步构建 presence-only snapshot（不发起网络请求）；`refresh()` 异步探测全部 entry 并缓存结果；`invalidate()` 清除缓存。
- `requireCapability(id)` 返回单个 entry 的 availability 或 typed redacted `OpenCodeUnsupportedCapabilityResult`，对未知 id 不抛异常。
- 所有错误原因都脱敏为粗粒度 class label，绝不持久化或记录 token、credential 或原始错误体。

## 与其他模块的交互

- `OpenCodeService` 在构造器中创建此 coordinator，传入 `getFacade: () => this.sdk`。
- `OpenCodeService.getSdkCapabilitySnapshot()` / `refreshSdkCapabilities()` / `requireSdkCapability()` 委托给它。
- 测试注入 fake facade 与注入时钟，验证 read-probe 顺序、endpoint-not-found → unsupported-by-server、transport failure → unknown、state-changing entry 不被调用。

### 1.17 experimental action evidence

针对 PTY、project copy、control-plane move-session 与 background session，coordinator 可以安全读取 `global.health.version` 作为 1.17+ 的支持证据。它不会为此调用 state-changing endpoint；health 不可用时仍保留 `unknown`，旧 server 明确低于 1.17 时才显示 `unsupported-by-server` 和 minimum-server hint。
