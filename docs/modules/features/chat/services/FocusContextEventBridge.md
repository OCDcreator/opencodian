# FocusContextEventBridge

> **源码**: `src/features/chat/services/FocusContextEventBridge.ts`
> **状态**: [REVIEW]

## 概述

`FocusContextEventBridge` 负责 composer/context 里的 focus-preview activation 事件桥接。它集中处理 workspace `file-open` / `active-leaf-change` / `editor-change`、composer DOM focus 事件、document 选择变化事件，以及 retained-selection polling 的启动和 runtime 清理。

## 导入关系

上游: `ComposerContextHostAdapter`、`ComposerContextEventBridge`
下游: `obsidian`（`App`、`MarkdownView`）、`FocusContextPreviewCoordinator`、`FocusContextRuntimeService`

## 公开接口

```typescript
interface FocusContextEventBridgeHost {
  getInputContainer(): HTMLElement | null
  registerEvent(eventRef: EventRef): void
  registerDomEvent(
    target: Window | Document | HTMLElement,
    type: string,
    callback: (event: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void
}

class FocusContextEventBridge {
  start(): void
  dispose(): void
}
```

## 核心逻辑

### workspace / editor 事件桥接

- 监听 `file-open`，经由 `FocusContextPreviewCoordinator` 同步 remembered markdown path、当前会话 note path，并触发 focus preview refresh
- 监听 `active-leaf-change`，统一调度 focus preview refresh
- 监听 `editor-change`，把活动 `MarkdownView` 与 editor 交给 `FocusContextPreviewCoordinator`

### composer / document 事件桥接

- 在 composer 容器上桥接 `pointerdown`、`focusin`、`focusout`
- 在 `document` 上桥接 `selectionchange`、`mouseup`、`keyup`
- bridge 只负责注册和路由，不重写 retained-selection 的真实判定逻辑

### polling 生命周期

- `start()` 末尾启动 `FocusContextRuntimeService.startRetainedSelectionPolling()`
- `dispose()` 统一转发给 `FocusContextRuntimeService.dispose()`

## 与其他模块的交互

- **ComposerContextHostAdapter**：提供 composer DOM 容器与 view 的 `registerEvent` / `registerDomEvent` seam
- **FocusContextPreviewCoordinator**：负责 file-open/current-note writeback 与 activation/editor-change 相邻的 preview refresh 协调
- **FocusContextRuntimeService**：负责 composer focus handoff、retained-selection polling 与 highlight 运行态

## 注意事项

- 这个 bridge 不持有 draft context、preview state 或附件构建逻辑
- `start()` 依赖 `OpenCodianView.buildUI()` 已经创建 composer 容器
- 新增 focus-preview activation 事件时，优先继续放在这里，避免再与 vault catalog mutation 混装
