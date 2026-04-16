# ComposerContextViewFacade

> **源码**: `src/features/chat/services/ComposerContextViewFacade.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextViewFacade` 现在既负责在 `create()` 里组装 composer-context 子服务，也负责把这些子服务收敛成一条更窄的 view-facing seam。它让 `OpenCodianView` 不再分别持有 `ContextAttachmentBuilder`、`ContextFileCatalogService`、action、picker、coordinator、event bridge、runtime store 与 focus-preview/runtime service，而是通过一个 facade 处理：

- composer context actions（current note / selection / file picker）
- context row 装配与 focus preview refresh
- send-preparation 专用的 draft context 读取 / 清空端口
- composer-context lifecycle 的启动与清理

这样 `OpenCodianView` 更接近 host assembly，composer/context 的具体 service fan-out 收回到 services 目录。

## 导入关系

上游: `OpenCodianView`
下游: `ComposerContextActionService`、`ComposerContextPickerActionService`、`ComposerContextCoordinator`、`ComposerContextEventBridge`、`ComposerContextRuntimeStore`、`FocusContextPreviewCoordinator`、`FocusContextRuntimeService`

## 公开接口

```typescript
interface ComposerSendContextPort {
  getDraftContextItems(tabId?: TabId | null): PromptContextItem[]
  clearDraftContextItems(tabId?: TabId | null): void
}

class ComposerContextViewFacade {
  readonly sendContext: ComposerSendContextPort
  static create(options: ComposerContextViewFacadeCreateOptions): ComposerContextViewFacade
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

### bundle 装配

- `create()` 负责创建 `ContextAttachmentBuilder`、`ContextFileCatalogService`，并把 `ComposerContextRuntimeStore`、action/picker/chip/coordinator、focus-preview runtime 与 event bridge 组装成完整的 composer-context lifecycle owner
- `createComposerContextServices()` 保留为更低层的装配入口，便于 focused tests 以 mocked builder / catalog 断言 bundle wiring，而不把这些依赖重新暴露给 `OpenCodianView`

### view-facing 收口

- `sendContext.getDraftContextItems()` / `sendContext.clearDraftContextItems()` 继续复用 `ComposerContextRuntimeStore`，但只把发送前依赖暴露给 send-preparation
- `setContextRowElement()` 只把 row-element 写给 `ComposerContextCoordinator`
- `addChosenFileContextToActiveTab()` / `addCurrentNoteContextFromActiveEditor()` / `addSelectionContextFromActiveEditor()` 分别委托给现有 action service，不改动 picker、chips 或 retained-selection 行为
- `refreshActiveFocusContextPreview()` 与 `getActiveMarkdownView()` 保留 focus-preview/runtime 的窄入口，供 activation bridge 与 view helper 复用
- `start()` / `dispose()` 继续只透传 composer-context lifecycle bridge，不把事件注册细节带回 view

## 注意事项

- 这个 facade 是 composer-context 的总 owner；`create()` 可以拥有 builder / catalog 的创建，但不应重新长回 catalog mutation 规则或 retained-selection 算法本身
- send-preparation 只应消费 `sendContext` 端口，避免重新依赖完整 composer facade
- 新增 composer/context 入口时，优先判断是否属于现有 facade 的 host-facing职责；若需要多个内部 service 协作，再考虑继续下沉到 services 层
- 若未来其它 runtime bridge 只需要 focus-preview refresh 端口，可直接复用 facade，而不必重新把 `FocusContextPreviewCoordinator` 暴露给 `OpenCodianView`
