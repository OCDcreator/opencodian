# ComposerContextEventBridge

> **源码**: `src/features/chat/services/ComposerContextEventBridge.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextEventBridge` 把 `OpenCodianView` 里的 composer/context 相关事件注册收束到一个单一职责 bridge。它统一桥接 workspace、vault 和 composer/document DOM 事件，再把事件落到 `FocusContextRuntimeService` 与 `ContextFileCatalogService`，同时代持 retained-selection polling 的启动/清理入口。

## 导入关系

上游: `obsidian`（`App`、`MarkdownView`）、`FocusContextRuntimeService`、`ContextFileCatalogService`
下游: `OpenCodianView`

## 公开接口

```typescript
interface ComposerContextEventBridgeHost {
  setCurrentConversationNotePath(path: string | null): void
  getInputContainer(): HTMLElement | null
  registerEvent(eventRef: EventRef): void
  registerDomEvent(
    target: Window | Document | HTMLElement,
    type: string,
    callback: (event: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void
}

class ComposerContextEventBridge {
  start(): void
  dispose(): void
}
```

## 核心逻辑

### workspace / editor 事件桥接

- 监听 `file-open`，同步 remembered markdown path、当前会话 note path，并触发 focus preview refresh
- 监听 `active-leaf-change`，统一触发 focus preview refresh
- 监听 `editor-change`，把活动 `MarkdownView` 与 editor 直接转交给 `FocusContextRuntimeService`

### composer / document 事件桥接

- 在 composer 容器上桥接 `pointerdown`、`focusin`、`focusout`
- 在 `document` 上桥接 `selectionchange`、`mouseup`、`keyup`
- bridge 只负责注册和路由，不重写 retained-selection 的真实判定逻辑

### catalog 与 polling 生命周期

- 监听 vault `create/delete/rename`，把文件目录增量更新交给 `ContextFileCatalogService`
- `start()` 末尾启动 `FocusContextRuntimeService.startRetainedSelectionPolling()`
- `dispose()` 统一转发给 `FocusContextRuntimeService.dispose()`

## 与其他模块的交互

- **OpenCodianView**：提供当前会话 note path 写回、composer DOM 容器，以及 Obsidian view 自带的 event/dom-event 注册入口
- **FocusContextRuntimeService**：负责 focus preview、retained-selection handoff 与 highlight 运行态
- **ContextFileCatalogService**：负责 context 文件目录的缓存与增量维护

## 注意事项

- bridge 只桥接事件和 lifecycle，不持有 draft context、preview state 或附件构建逻辑
- `start()` 依赖 `OpenCodianView.buildUI()` 已经创建 composer 容器
- 保持既有 workspace/vault/document 事件来源与回调顺序，避免改变 focus preview 与 catalog 刷新语义
