# ChatSelectionControlsCoordinator

> **源码**: `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatSelectionControlsCoordinator` 承接聊天输入工具栏里 model selector 与 permission selector 的 dropdown lifecycle、search/list 渲染，以及模型目录缓存、requested/current/resolved selection 解析与 unavailable follow-up ownership，避免 `OpenCodianView` 继续直接铺开这两套状态机和 model-selection 分支。

它负责：

- 加载并缓存 model catalog bundle / available providers，维护 requested/current/resolved model selection
- 创建 toolbar 内的 permission / model selector 容器、trigger 与 dropdown
- 维护 model selector 的搜索、keyboard navigation、sticky header cleanup 与 provider icon 刷新
- 统一更新当前模型显示、unavailable / unconfigured class、switch-model override 写回、unavailable notice 文案与 effort selector 连动
- 维护 permission selector 的 mode label、selected state 与 dropdown open/close lifecycle
- 通过共享 escape handler 收束两个 selector 的关闭行为

## 公开接口

```typescript
export interface ChatSelectionControlsCoordinatorHost {
  registerEscapeHandler(handler: () => boolean): void;
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
  resolveProviderIconUrl(providerId: string): Promise<string | null>;
  updateEffortSelectorDisplay(): void;
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<void>;
}

export class ChatSelectionControlsCoordinator {
  build(toolbarEl: HTMLElement): void;
  reloadModelCatalog(): Promise<void>;
  hasLoadedModelCatalog(): boolean;
  getAvailableProviders(): readonly ModelSelectorProvider[];
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  formatModelId(model: Partial<ModelSelectorSelection> | null | undefined): string | undefined;
  ensureSelectedModelAvailable(provider: string | undefined, model: string | undefined): Promise<boolean>;
  getModelUnavailableNoticeContent(): { title: string; message: string };
  refreshModelOptions(): void;
  updateModelSelectorDisplay(): void;
  updatePermissionTriggerDisplay(): void;
  applyLocaleTexts(): void;
  destroy(): void;
}
```

## 关键行为

- `build()` 一次性挂载 permission/model selector，并注册共享的 Escape close handler
- `reloadModelCatalog()` 触发 host data reload，重建 available provider/model cache，并同步 active-tab context-usage identity
- `getCurrentSessionModel()` / `getCurrentSessionModelResolution()` 在 owner 内完成 requested/current/resolved selection 推导，不再要求 view 直接维护 catalog 分支
- `ensureSelectedModelAvailable()` / `getModelUnavailableNoticeContent()` 把 send 前 availability follow-up 与 notice copy 判定收束到 selector owner
- `refreshModelOptions()` / `updateModelSelectorDisplay()` 把 list 渲染、trigger/icon 刷新与 unavailable/unconfigured state 收束到同一个 owner
- `updatePermissionTriggerDisplay()` / `applyLocaleTexts()` 统一刷新 permission mode 文案与 selected state
- `destroy()` 关闭 dropdown、移除 document click listener，并释放 sticky header cleanup

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供 model catalog data source、tab override writeback、model-source mode / server availability 查询、provider icon service 调用和 permission-mode settings writeback等 host seam
- dropdown/search/list/selection display lifecycle，以及 model catalog cache、selection resolution、switch-model notice 与 unavailable follow-up 已迁到 `ChatSelectionControlsCoordinator`
- send pipeline options、`ModelCatalogStateService`、provider availability 语义与 icon fallback 顺序没有变化
- 该模块刻意不接管 context usage、effort selector 或 input glass/theme；这些仍在相邻 owner 中维护
