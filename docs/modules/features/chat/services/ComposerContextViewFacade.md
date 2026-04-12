# ComposerContextViewFacade

> **源码**: `src/features/chat/services/ComposerContextViewFacade.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextViewFacade` 把 `ComposerContextHostAdapter` 组装出的 composer-context 子服务收敛成一条更窄的 view-facing seam。它让 `OpenCodianView` 不再分别持有 action、picker、coordinator、event bridge、runtime store 与 focus-preview/runtime service，而是通过一个 facade 处理：

- composer context actions（current note / selection / file picker）
- context row 装配与 focus preview refresh
- draft context items 的读取与清空
- composer-context lifecycle 的启动与清理

这样 `OpenCodianView` 更接近 host assembly，composer/context 的具体 service fan-out 收回到 services 目录。

## 导入关系

上游: `ComposerContextHostAdapter`、`OpenCodianView`
下游: `ComposerContextActionService`、`ComposerContextPickerActionService`、`ComposerContextCoordinator`、`ComposerContextEventBridge`、`ComposerContextRuntimeStore`、`FocusContextPreviewCoordinator`、`FocusContextRuntimeService`

## 公开接口

```typescript
class ComposerContextViewFacade {
  getDraftContextItems(tabId?: TabId | null): PromptContextItem[]
  clearDraftContextItems(tabId?: TabId | null): void
  getActiveMarkdownView(): MarkdownView | null
  refreshActiveFocusContextPreview(): void
  setContextRowElement(contextRowEl: HTMLElement | null): void
  addChosenFileContextToActiveTab(): Promise<boolean>
  addCurrentNoteContextFromActiveEditor(view?: MarkdownView | null): Promise<boolean>
  addSelectionContextFromActiveEditor(
    editor?: Editor | null,
    view?: MarkdownView | null,
  ): Promise<boolean>
  start(): void
  dispose(): void
}
```

## 核心逻辑

### view-facing 收口

- `getDraftContextItems()` / `clearDraftContextItems()` 继续复用 `ComposerContextRuntimeStore`
- `setContextRowElement()` 只把 row-element 写给 `ComposerContextCoordinator`
- `addChosenFileContextToActiveTab()` / `addCurrentNoteContextFromActiveEditor()` / `addSelectionContextFromActiveEditor()` 分别委托给现有 action service，不改动 picker、chips 或 retained-selection 行为
- `refreshActiveFocusContextPreview()` 与 `getActiveMarkdownView()` 保留 focus-preview/runtime 的窄入口，供 activation bridge 与 view helper 复用
- `start()` / `dispose()` 继续只透传 composer-context lifecycle bridge，不把事件注册细节带回 view

## 注意事项

- 这个 facade 是 view-facing seam，不应重新长回 `PromptContextItem` 构建、catalog mutation 或 retained-selection 算法
- 新增 composer/context 入口时，优先判断是否属于现有 facade 的 host-facing职责；若需要多个内部 service 协作，再考虑继续下沉到 services 层
- 若未来其它 runtime bridge 只需要 focus-preview refresh 端口，可直接复用 facade，而不必重新把 `FocusContextPreviewCoordinator` 暴露给 `OpenCodianView`
