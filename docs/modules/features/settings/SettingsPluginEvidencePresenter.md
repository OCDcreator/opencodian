# SettingsPluginEvidencePresenter

> **源码**: `src/features/settings/SettingsPluginEvidencePresenter.ts`
> **状态**: [REVIEW]

## 概述

`SettingsPluginEvidencePresenter` 是插件 SDK evidence 的只读渲染 owner。它负责把 `PluginEnvironmentSnapshot` 中的本地声明摘要，以及 `PluginEvidenceSnapshot` 中的 effective config、runtime IDs、transport state 渲染为结构清晰的 DOM，并支持在 listener 回调到达时仅更新 SDK evidence 区而不重建本地摘要。

该 presenter 不持有业务状态、不访问 `OpenCodeService`、不写文件系统；所有状态刷新与订阅生命周期仍由 `SettingsPluginSection` 控制。

## 核心职责

- `renderOverview(containerEl, snapshot, evidence)` —— 清空容器并渲染四层：local-summary、effective-config、runtime、transport
- `updateSdkEvidence(containerEl, evidence)` —— 在已渲染的 overview 中查找 effective/runtime/transport 三个区并更新其内容；local-summary 与 remote notice 保持不动
- 提供 key-value rows、spec list、runtime ID list、timestamp/format、fetch status 等私有渲染 helper

## 渲染规则

### local-summary

显示 service mode、isolation mode、vault config dir、global influence、project config count、project directory count。远程模式下额外渲染 `[data-remote-honesty="true"]` 提示。

### effective-config

- 标题与说明始终保留
- fetch meta 行：connection generation、fetch status、attemptedAt、generation、error（按需显示）
- `data-effective-state="current"` 当前 effective specs
- `data-effective-state="stale"` 过期 effective specs
- 无 effective 且无非 current/stale 时显示空态

fetch status 诚实区分：
- `idle` + `attemptedAt === null` → 空闲/未请求
- `idle` + `attemptedAt` 有值 → 刷新中（refreshing）
- `ready`
- `error`

### runtime

- 标题明确为“未归因运行时插件 ID / Unattributed runtime plugin IDs”
- `data-runtime-state="current"` 当前 runtime IDs
- `data-runtime-state="stale"` 过期 runtime IDs
- 不与任何声明自动匹配，不标记 loaded

### transport

显示 wanted、active sources、capture generation、capture started at，并附带无 replay 说明。

## 关键 DOM / data 属性

| 属性 | 说明 |
|------|------|
| `data-evidence-kind="local-summary"` | 本地声明汇总区 |
| `data-evidence-kind="effective-config"` | SDK effective config evidence 区 |
| `data-effective-state="current"` / `"stale"` | 当前 / 过期 effective specs 子区 |
| `data-evidence-kind="runtime"` | 未归因 runtime IDs 区 |
| `data-runtime-state="current"` / `"stale"` | 当前 / 过期 runtime IDs 子区 |
| `data-runtime-current="true"` / `"false"` | 单个 runtime ID 条目是否当前 |
| `data-evidence-kind="transport"` | event transport / capture 状态区 |
| `data-remote-honesty="true"` | 远程模式本地-only 提示 |

## 与其他模块的交互

- `SettingsPluginSection.ts`: 创建 presenter 实例，在 overview 挂载/刷新时调用 `renderOverview`，在 SDK evidence listener 回调时调用 `updateSdkEvidence`
- `OpenCodeEventSubscriptionCoordinator.ts`: 提供 `PluginEvidenceSnapshot` 类型与证据语义
- `PluginManagementService.ts`: 提供 `PluginEnvironmentSnapshot` 类型
