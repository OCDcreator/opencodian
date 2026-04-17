# modelConfigModalState

> **源码**: `src/features/settings/modelConfigModalState.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigModalState` 收拢 `ModelConfigModal` 的 durable 非 UI 状态转换：快照生成、JSON draft 解析、provider draft → 表单状态同步，以及空白 provider / key-value 草稿这类 state-only 规则。它不做 IO、保存编排或 DOM 生命周期，只负责 modal 内部可重复使用的状态语义。

## 导入关系

```text
上游: ../../core/types, ../../i18n, ./modelConfigWorkspace
下游: ModelConfigModal, modelConfigSavePlan
```

## 核心导出

| 导出 | 说明 |
|------|------|
| `ModelConfigModalFlow` | modal 当前处于 workspace 还是 add-provider 流程 |
| `createModelConfigModalSnapshot()` | 生成关闭保护所需的稳定快照 |
| `resolveModelConfigJsonDraftValue()` | 统一 textarea 当前值与内存 draft 回退 |
| `parseAddProviderJsonDraft()` / `tryParseAddProviderJsonDraft()` | 解析新增 provider 的 JSON 草稿 |
| `syncProviderFormFromJsonDraft()` | 把 JSON draft 同步回 provider 表单状态 |
| `createModelConfigKeyValueState()` | 创建 key-value 草稿项 |
| `isBlankProviderState()` | 判断当前 provider 是否仍是空白草稿 |

## 状态边界

- **快照语义**：workspace 流程只比较 provider / model 表单状态；add-provider 流程额外把 JSON draft 纳入快照，保证关闭确认覆盖“只改 JSON”的情况。
- **draft 解析**：把“必须是对象、不能为空”的 JSON 规则集中在一处，避免 modal 自己重复处理错误分支。
- **表单同步**：`syncProviderFormFromJsonDraft()` 继续保留已有模型的 `enabled` 状态，不会因为重新格式化 JSON 就把 model 过滤开关重置回默认值。
- **无 UI 副作用**：这里不创建 `Notice`、不调用 `saveSettings()`、不碰 server restart，仅返回/更新纯状态。

## 与其他模块的交互

- 复用 `modelConfigWorkspace.ts` 的 provider/model hydration primitives。
- 被 `modelConfigSavePlan.ts` 复用 JSON draft 解析能力，避免保存路径和格式化路径出现两套规则。
- 被 `ModelConfigModal.ts` 当作 state seam 使用，使 modal 继续聚焦 UI 生命周期、事件绑定与 save side effects。
