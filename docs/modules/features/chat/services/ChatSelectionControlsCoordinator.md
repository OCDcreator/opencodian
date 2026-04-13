# ChatSelectionControlsCoordinator

> **源码**: `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatSelectionControlsCoordinator` 承接聊天输入工具栏里 model selector 与 permission selector 的 dropdown lifecycle、search/list 渲染与 selection display ownership，避免 `OpenCodianView` 继续直接铺开这两套状态机。

它负责：

- 创建 toolbar 内的 permission / model selector 容器、trigger 与 dropdown
- 维护 model selector 的搜索、keyboard navigation、sticky header cleanup 与 provider icon 刷新
- 统一更新当前模型显示、unavailable / unconfigured class 与 effort selector 连动
- 维护 permission selector 的 mode label、selected state 与 dropdown open/close lifecycle
- 通过共享 escape handler 收束两个 selector 的关闭行为

## 公开接口

```typescript
export interface ChatSelectionControlsCoordinatorHost {
  registerEscapeHandler(handler: () => boolean): void;
  loadModelCatalog(): Promise<void>;
  getAvailableProviders(): readonly ModelSelectorProvider[];
  hasLoadedModelCatalog(): boolean;
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ModelSelectorDisplayResolution;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  getModelUnavailableTitle(): string;
  resolveProviderIconUrl(providerId: string): Promise<string | null>;
  switchModel(provider: string, model: string): void;
  updateEffortSelectorDisplay(): void;
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<void>;
}

export class ChatSelectionControlsCoordinator {
  build(toolbarEl: HTMLElement): void;
  reloadModelCatalog(): Promise<void>;
  refreshModelOptions(): void;
  updateModelSelectorDisplay(): void;
  updatePermissionTriggerDisplay(): void;
  applyLocaleTexts(): void;
  destroy(): void;
}
```

## 关键行为

- `build()` 一次性挂载 permission/model selector，并注册共享的 Escape close handler
- `reloadModelCatalog()` 触发 host data reload，再重绘 model list 与 trigger display
- `refreshModelOptions()` / `updateModelSelectorDisplay()` 把 list 渲染与 trigger/icon 刷新收束到同一个 owner
- `updatePermissionTriggerDisplay()` / `applyLocaleTexts()` 统一刷新 permission mode 文案与 selected state
- `destroy()` 关闭 dropdown、移除 document click listener，并释放 sticky header cleanup

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍保留 model catalog data source、current selection resolution、provider icon service 调用和 permission-mode settings writeback
- dropdown/search/list/selection display lifecycle 已迁到 `ChatSelectionControlsCoordinator`
- send pipeline options、`ModelCatalogStateService`、provider availability 语义与 icon fallback 顺序没有变化
- 该模块刻意不接管 context usage、effort selector 或 input glass/theme；这些仍在相邻 owner 中维护
