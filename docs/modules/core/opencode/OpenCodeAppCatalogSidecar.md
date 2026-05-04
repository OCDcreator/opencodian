# OpenCodeAppCatalogSidecar

> **源码**: `src/core/opencode/OpenCodeAppCatalogSidecar.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeAppCatalogSidecar` 是 OpenCode app-level catalog 的轻量 sidecar contract。它让 `OpenCodeSdkFacade` 可以在 `app.skills()` 的返回值上附带同一 app namespace 读取到的 `app.agents()` promise，而消费方不需要导入完整 SDK façade 或重新知道 SDK client 创建细节。

这个模块只保存不可枚举的 symbol 属性，不发起 I/O，也不改变原始 `app.skills()` 返回数组的可枚举形状。

## 公开接口

```typescript
export function attachOpenCodeAppAgents(value: unknown, agentsPromise: Promise<unknown>): unknown;
export function getAttachedOpenCodeAppAgents(value: unknown): Promise<unknown> | undefined;
```

## 行为

- `attachOpenCodeAppAgents()` 会把 agents promise 作为不可枚举属性挂到 object/array 结果上；如果结果被冻结或不可扩展，会静默保留原值
- `getAttachedOpenCodeAppAgents()` 只读取这个 sidecar promise；没有 sidecar 时返回 `undefined`
- sidecar 的值保持 `unknown`，由下游 catalog owner 自己做 SDK shape normalize

## 边界

- 不创建 SDK client，也不导入 `createSdkClient`
- 不合并 runtime/project/file agent truth；这是 `AgentCatalogService` / `AgentMentionCandidateService` 的职责
- 不渲染 composer menu，也不构造 request part
