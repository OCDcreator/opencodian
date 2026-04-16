# Model Config Selection Owner

> **源码**: `src/core/config/modelConfigSelection.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigSelection.ts` 收口聊天/设置共用的模型选择语义：

- `resolveModelSelection()`：available / unavailable / unconfigured 状态
- `resolvePreferredAvailableModel()`：同 provider 默认模型、首个模型与全局默认模型回退

## 关键导出

- `ModelReference`
- `ResolvedModelSelection`
- `resolveModelSelection()`
- `resolvePreferredAvailableModel()`

## 边界

- 这里只消费 catalog 事实与引用 helper，不参与 provider availability layering。
- 如果后续 title-generation 或 chat picker 需要新增选择语义，优先扩展这里，不要回到 catalog/availability owner。
