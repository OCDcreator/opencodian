# OpenCodeSdkCapabilityRegistry

> **源码**: `src/core/opencode/OpenCodeSdkCapabilityRegistry.ts`
> **状态**: [REVIEW]

## 概述

静态能力注册表，列出 OpenCode SDK 中所有需要被产品化或诊断追踪的 namespace 方法。每条 `OpenCodeSdkCapabilityDefinition` 记录 stable id、`sdkPath`、category、surface、risk、defaultGate、serverProbe 策略、fallbackPolicy、minimumServerHint 与 description。注册表是 UI 可见性、disabled 状态、feature gate、诊断与兼容性报告的唯一元数据来源。

## 核心逻辑

- 注册表覆盖顶层 namespace（`app`、`auth`、`config`、`session`、`mcp`、`project`、`pty`、`vcs` 等）以及全部 14 个新 `client.v2.*` 子 namespace（`v2.health`、`v2.location`、`v2.agent`、`v2.session`、`v2.model`、`v2.provider`、`v2.integration`、`v2.credential`、`v2.permission`、`v2.fs`、`v2.command`、`v2.skill`、`v2.event`、`v2.pty`、`v2.question`、`v2.reference`、`v2.projectCopy`）。
- risk 映射 gate/probe：`read-only` → defaultGate true + read probe；`state-changing` → defaultGate false + `none` probe（绝不调用）；`experimental-action` → defaultGate false + presence probe；`stream` → defaultGate false + presence probe。
- `getOpenCodeSdkCapabilityRegistry()` 返回深拷贝，防止调用方意外修改静态表。
- 来源事实见 `docs/status/opencode-sdk-1.17.18-capability-inventory.md`。

## 与其他模块的交互

- `OpenCodeSdkCapabilityDiscoveryCoordinator` 以此注册表为输入，对每个 entry 解析 SDK presence 与服务端支持。
- `OpenCodeService.getSdkCapabilitySnapshot()` / `requireSdkCapability()` 间接消费此注册表。
- Settings 与 Chat 通过 service 返回的 snapshot 渲染稳定 / 禁用 / 实验状态，不直接读注册表。
