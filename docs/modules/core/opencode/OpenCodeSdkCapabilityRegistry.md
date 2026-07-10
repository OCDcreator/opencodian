# OpenCodeSdkCapabilityRegistry

> **源码**: `src/core/opencode/OpenCodeSdkCapabilityRegistry.ts`
> **状态**: [REVIEW]

## 概述

静态能力注册表，列出 OpenCode SDK 中所有需要被产品化或诊断追踪的 namespace 方法。每条 `OpenCodeSdkCapabilityDefinition` 记录 stable id、`sdkPath`、category、surface、risk、defaultGate、serverProbe 策略、fallbackPolicy、minimumServerHint、可选的 Test Vault `runtimeProof` 元数据与 description。注册表是 UI 可见性、disabled 状态、feature gate、诊断与兼容性报告的唯一元数据来源。

## 核心逻辑

- 注册表覆盖顶层 namespace（`app`、`auth`、`config`、`session`、`mcp`、`project`、`pty`、`vcs` 等）以及全部 14 个新 `client.v2.*` 子 namespace（`v2.health`、`v2.location`、`v2.agent`、`v2.session`、`v2.model`、`v2.provider`、`v2.integration`、`v2.credential`、`v2.permission`、`v2.fs`、`v2.command`、`v2.skill`、`v2.event`、`v2.pty`、`v2.question`、`v2.reference`、`v2.projectCopy`）。
- risk 映射 gate/probe：`read-only` → defaultGate true + read probe；`state-changing` → defaultGate false + `none` probe（绝不调用）；`experimental-action` → defaultGate false + presence probe；`stream` → defaultGate false + presence probe。
- `getOpenCodeSdkCapabilityRegistry()` 深拷贝数组、entry、`sdkPath` 和可选 `runtimeProof`，防止调用方篡改后续 snapshot 的定义或已有 runtime proof。
- 来源事实见 `docs/status/opencode-sdk-1.17.18-capability-inventory.md`。

## 与其他模块的交互

- `OpenCodeSdkCapabilityDiscoveryCoordinator` 以此注册表为输入，对每个 entry 解析 SDK presence 与服务端支持。
- `OpenCodeService.getSdkCapabilitySnapshot()` / `requireSdkCapability()` 间接消费此注册表。
- Settings 与 Chat 通过 service 返回的 snapshot 渲染稳定 / 禁用 / 实验状态，不直接读注册表。

### 1.17 experimental action metadata

`v2.pty.create`、`v2.projectCopy.create`、`experimental.controlPlane.moveSession` 与 `experimental.session.background` 都保留 `OpenCode server 1.17+` minimum hint。它们的实际执行仍是 default-off 的 product gate，不因 registry 或 SDK presence 自动暴露。

### Runtime proof metadata

`runtimeProof` 只保存已经由 Test Vault 场景保留的 `verifiedAt`、`BUILD_ID` 和 artifact path。它不是 SDK presence、server advertisement 或 Capability Lab readback 的替代品；没有这三项保留证据时，诊断面板不会把条目显示成 `runtime-proven`。
