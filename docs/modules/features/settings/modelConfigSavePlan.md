# modelConfigSavePlan

> **源码**: `src/features/settings/modelConfigSavePlan.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigSavePlan` 是 `ModelConfigModal` 的保存语义 owner。它集中处理 provider availability 子集、provider/model 序列化、`disabledModelRefs` 规划，以及 workspace / add-provider 两条保存路径的 plan 组装，让 modal 本体只负责触发保存、写入后副作用与错误展示。

## 导入关系

```text
上游: ../../core/config/modelConfig, ../../core/types, ../../i18n, ./modelConfigWorkspace, ./modelConfigModalState
下游: ModelConfigModal
```

## 核心导出

| 导出 | 说明 |
|------|------|
| `ModelConfigSavePlan` | modal 写入前的统一计划结构 |
| `buildModelConfigSavePlan()` | 按 flow 选择 workspace / add-provider 保存计划 |
| `buildAvailabilitySubset()` | 基于本地配置、server 继承与当前表单状态计算 provider availability |
| `toModelConfig()` | workspace 表单 -> `OpencodeModelConfigSubset` |
| `buildNextDisabledModelRefs()` | 规划 model 级过滤开关写回 |
| `serializeProviderConfig()` | provider 表单 -> OpenCode provider 配置对象 |

## 保存语义

- **workspace flow**：全量序列化当前 provider/model 草稿，写回 `model` / `small_model` / `provider` / availability 子集，并重建 `disabledModelRefs`。
- **add-provider flow**：以 JSON draft 为准写入新增 provider，同时沿用当前 provider availability 规划，但不重建整个 workspace config，也不触发 model 级 disabled refs 重算。
- **availability**：继续使用 core `setProviderEnabled()` 合并 local + inherited scope 语义，避免 modal 内重新实现 provider 开关规则。
- **序列化**：provider 未托管字段仍通过 `cloneUnmanagedProviderFields()` 保留；模型 `options` / `variants` / extra fields 的校验与 loose value 解析统一集中。

## 约束

- 不处理 `writeLocalModelConfig()`、`saveSettings()`、`Notice` 或 server restart。
- 不触碰 provider/model 卡片 UI；只接受已经水合好的 `ProviderFormState[]`。
- 不改变 `disabledModelRefs` 与 provider availability 的既有持久化语义，只把这些规则从 modal 内联逻辑提炼成稳定 owner。

## 与其他模块的交互

- 依赖 `modelConfigModalState.ts` 的 JSON draft 解析，确保“格式化 JSON”“直接保存 JSON”两条路径共享同一校验标准。
- 依赖 `modelConfigWorkspace.ts` 的 parse / validation helpers，避免再次分叉 provider/model 字段语义。
- 被 `ModelConfigModal.ts` 调用后，由 modal 本体继续负责 apply/finalize save side effects。
