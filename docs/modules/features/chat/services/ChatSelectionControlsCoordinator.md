# ChatSelectionControlsCoordinator

> **源码**: `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatSelectionControlsCoordinator` 承接聊天输入工具栏里 permission / model selector 的 UI lifecycle。model selector 的目录缓存、requested/current/resolved selection 解析、active-tab override 写回与 unavailable follow-up ownership 委托给 `ModelSelectionRuntime`；permission selector 的 trigger、option list、open/close 与 mode writeback 下沉到 `PermissionModeSelectorCoordinator`。

它负责：

- 通过 `ModelSelectionRuntime` 加载并缓存 model catalog bundle / available providers，维护 requested/current/resolved model selection
- 创建 toolbar 内的 permission / model selector 容器，并把 permission 容器交给 `PermissionModeSelectorCoordinator`
- 维护 model selector 的搜索、keyboard navigation、sticky header cleanup 与 provider icon 刷新
- 统一更新当前模型显示、unavailable / unconfigured class、switch-model override 写回结果、unavailable notice 文案与 effort selector 连动；trigger tooltip 明确这是当前标签的发送覆盖，不是持久化 `ConversationSessionSettings`
- 委托 `PermissionModeSelectorCoordinator` 维护 permission selector 的 mode label、selected state 与 dropdown open/close lifecycle
- 通过共享 escape handler 收束两个 selector 的关闭行为

## 公开接口

```typescript
export interface ChatSelectionControlsCoordinatorHost extends ModelSelectionRuntimeHost {
  registerEscapeHandler(handler: () => boolean): void;
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

- `build()` 一次性挂载 permission / model selector，并注册共享的 Escape close handler
- `reloadModelCatalog()` 触发 runtime data reload，重建 available provider/model cache，并同步 active-tab context-usage identity
- `getCurrentSessionModel()` / `getCurrentSessionModelResolution()` 通过 `ModelSelectionRuntime` 完成 requested/current/resolved selection 推导，不再要求 view 直接维护 catalog 分支
- `ensureSelectedModelAvailable()` / `getModelUnavailableNoticeContent()` 把 send 前 availability follow-up 与 notice copy 判定委托到 selection runtime
- `refreshModelOptions()` / `updateModelSelectorDisplay()` 把 list 渲染、trigger/icon 刷新与 unavailable/unconfigured state 收束到同一个 owner
- `updatePermissionTriggerDisplay()` / `applyLocaleTexts()` 继续作为 view-facing 入口，但 permission mode 文案与 selected state 刷新会委托给 `PermissionModeSelectorCoordinator`
- model dropdown 的 outside-click listener 使用 capture 阶段注册，确保点击其他 toolbar dropdown trigger 时当前 dropdown 能被正确关闭
- model selector trigger 现在携带 `role="button"`、`tabindex="0"`、`aria-haspopup="listbox"` 与 `aria-expanded`，dropdown 打开/关闭时同步更新这些属性并添加/移除 `is-open` 类以触发 CSS 动画
- `destroy()` 关闭 dropdown、移除 document click listener，并释放 sticky header cleanup

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供 model catalog data source、tab override writeback、model-source mode / server availability 查询、provider icon service 调用和 permission-mode settings writeback等 host seam
- model dropdown/search/list/selection display lifecycle 仍集中在 `ChatSelectionControlsCoordinator`；model catalog cache、selection resolution、switch-model notice 与 unavailable follow-up 已进一步收束到 `ModelSelectionRuntime`
- 当前聊天模型选择写入 active-tab `modelOverride`，用于当前标签后续发送；不要把它描述为会话设置弹窗里的持久化 session setting。
- permission dropdown lifecycle 由 `PermissionModeSelectorCoordinator` 承接，并仍通过 shared Escape handler 与 model dropdown 一起关闭
- send pipeline options、`ModelCatalogStateService`、provider availability 语义与 icon fallback 顺序没有变化
- 该模块刻意不接管 context usage、effort selector 或 input glass/theme；这些仍在相邻 owner 中维护
