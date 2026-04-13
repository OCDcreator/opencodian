# ComposerContextHostAdapter

> **源码**: `src/features/chat/services/ComposerContextHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextHostAdapter` 现在只保留为兼容导出层，把历史上的 host-adapter 工厂导出转发到 `ComposerContextViewFacade`。实际的 composer-context bundle 装配已经迁入 `ComposerContextViewFacade.create()` / `createComposerContextServices()`，因此 `OpenCodianView` 不再直接依赖本模块。

## 导入关系

上游: focused tests / 兼容导入
下游: `ComposerContextViewFacade`

## 公开接口

```typescript
interface ComposerContextViewHost {
  getActiveTabId(): TabId | null
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null
  getActiveMarkdownView(): MarkdownView | null
  getInputContainer(): HTMLElement | null
  registerEvent(eventRef: EventRef): void
  registerDomEvent(...): void
}

interface FocusContextRuntimeViewHost {
  getCurrentConversationNotePath(): string | null
  isComposerInteractionFocused(): boolean
}

interface FocusContextPreviewWritebackHost {
  setCurrentConversationNotePath(path: string | null): void
}

export { createComposerContextServices, ... } from './ComposerContextViewFacade'
```

## 核心逻辑

### 当前职责

- 仅转发 `createComposerContextServices()` 与相关 host 类型，避免历史导入在一轮内全部改名
- 真正的 bundle 装配、builder/catalog 创建与 view-facing 收口都已经交给 `ComposerContextViewFacade`

## 注意事项

- 新代码优先直接导入 `ComposerContextViewFacade`，不要再把 `OpenCodianView` 接回这个兼容层
- 若后续彻底移除兼容导出，应同步更新仍保留历史导入的 focused tests
