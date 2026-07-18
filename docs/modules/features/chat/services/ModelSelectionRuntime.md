# ModelSelectionRuntime

> **源码**: `src/features/chat/services/ModelSelectionRuntime.ts`
> **状态**: [REVIEW]

## 概述

`ModelSelectionRuntime` 是 chat toolbar model selector 的 selection-state owner。它把 model catalog cache、active-tab requested/default selection、effective/base catalog resolution、server availability check、switch-model writeback 与 unavailable follow-up copy 从 `ChatSelectionControlsCoordinator` 的 DOM/dropdown lifecycle 中分离出来。

它负责：

- 加载 host 提供的 model catalog bundle 与 provider 列表，并生成 selector 可用的 provider/model snapshot
- 根据 active-tab override 与 default selection 推导 requested/current/resolved model
- 当 backend 只有轻量 provider snapshot、没有完整 `ModelCatalogBundle` 时，仍会用 snapshot 做 exact validation 与 fallback，避免旧 tab override 把未知 provider/model 直接送入发送管线
- 在 disabled model filtering 后保留 base catalog metadata，用于 unavailable/known model display
- 执行 send 前 server availability 验证，并根据 source mode 生成 unavailable follow-up 文案
- 通过 active-tab override seam 写回模型选择，并在成功时同步 context usage identity 与 switch notice

## 公开接口

```typescript
export interface ModelSelectionRuntimeHost {
  loadModelCatalogData(): Promise<{
    catalogBundle: ModelCatalogBundle | null;
    providers: readonly ModelSelectorProvider[];
  }>;
  getActiveTabModelOverride(): ModelSelectorSelection | null;
  setActiveTabModelOverride(selection: ModelSelectorSelection): boolean;
  getDefaultModelSelection(): ModelSelectorSelection | null;
  syncActiveTabContextUsageIdentity(): void;
  getModelSourceMode(): ModelSourceMode;
  isModelAvailableOnServer(provider: string, model: string): Promise<boolean>;
}

export interface ModelUnavailableNoticeContent {
  title: string;
  message: string;
}

export class ModelSelectionRuntime {
  reloadModelCatalog(): Promise<void>;
  reset(): void;
  hasLoadedModelCatalog(): boolean;
  getAvailableProviders(): readonly ModelSelectorProvider[];
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  formatModelId(model: Partial<ModelSelectorSelection> | null | undefined): string | undefined;
  ensureSelectedModelAvailable(provider: string | undefined, model: string | undefined): Promise<boolean>;
  getModelUnavailableNoticeContent(): ModelUnavailableNoticeContent;
  switchModel(provider: string, model: string): boolean;
}
```

## 关键行为

- `reloadModelCatalog()` 只更新 model selection runtime snapshot；dropdown rerender 与 trigger/icon refresh 仍由 `ChatSelectionControlsCoordinator` 编排
- `getCurrentSessionModel()` 对 requested override/default selection 应用 effective catalog fallback，保持 disabled model filtering 语义
- `getCurrentSessionModel()` 在无 bundle 的 snapshot 模式下只返回 snapshot 中已知的模型；若 requested model 不存在，会回退到同 provider 首个模型或首个可用模型
- `findKnownModelInfo()` 优先返回 currently available model metadata，找不到时回落到 base catalog metadata
- `ensureSelectedModelAvailable()` 保留原有 resolution gate 与 server availability fallback；在 snapshot 模式下会先验证 provider/model 是否存在于 snapshot，未知模型不会进入 server availability seam
- `switchModel()` 返回 active-tab override writeback 是否被 host 接受；成功时同步 context usage identity 并显示 switch notice，调用方据此决定是否关闭卡片和恢复 composer focus

## 与 `ChatSelectionControlsCoordinator` 的边界

- `ModelSelectionRuntime` 不创建 DOM、不处理 dropdown/search/keyboard/sticky header，也不解析 provider icon
- `ChatSelectionControlsCoordinator` 继续负责 selector placement、list render、permission selector display 和 effort selector follow-up
- settings model catalog、provider icon fallback、send pipeline options 与 session override 语义保持在原有 owner / host seam 内
