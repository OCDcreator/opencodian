# OpenCodeSdkCapabilityState

> **源码**: `src/core/opencode/OpenCodeSdkCapabilityState.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeSdkCapabilityState` 是纯函数 + 纯类型模块，负责把「SDK 是否存在 / 服务端是否支持 / 用户 gate / 风险等级」四个输入解析成单一 availability 判定。它不持有状态、不访问 facade、不发起网络请求，所有逻辑都是确定性的纯函数，便于表驱动测试覆盖。

## 核心逻辑

- `resolveCapabilityAvailability(input)` 按以下优先级返回 discriminated union：
  1. `sdk === false` → `unsupported-by-sdk`
  2. `server === false` → `unsupported-by-server`（带 `reason`，可选 `minimumServerHint`）
  3. `gate === false` → `disabled-by-user`
  4. `server === 'unknown'` → `unknown`（不把 transient 传输失败静默升级为 unsupported）
  5. 全部满足 → `available`
- `gate` 优先于 `server === 'unknown'`：用户主动关闭某能力时，即使服务端支持不确定也应尊重用户意图。
- safety 分类：`read-only`、`state-changing`、`experimental-action`、`stream`，仅作为元数据传入，不改变解析优先级。
- `OpenCodeSdkCapabilityAvailabilityInput.server` 接受 `boolean | 'unknown'`，让协调器能把 transport 失败与确定的 endpoint-not-found 区分开。

## 与其他模块的交互

- `OpenCodeSdkCapabilityDiscoveryCoordinator` 对每个 registry entry 调用此 resolver，再用 definition 的 `minimumServerHint` 丰富 `unsupported-by-server` 结果（resolver 本身看不到 definition）。
- 测试通过表驱动方式覆盖所有 sdk/server/gate/safety 交叉组合。
