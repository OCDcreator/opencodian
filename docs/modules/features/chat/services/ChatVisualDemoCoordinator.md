# ChatVisualDemoCoordinator

> **源码**: `src/features/chat/services/ChatVisualDemoCoordinator.ts`

## 概述

`ChatVisualDemoCoordinator` 把 `OpenCodianView` 里 Liquid Diamond（CPU + WebGL）和 Glass Octahedron 两种实验性 visual demo 的 toggle、互斥、destroy 收束到一个独立 owner。

它不负责 demo 的渲染算法；渲染仍在 `liquidDiamondDemo.ts`、`liquidDiamondDemoWebgl.ts` 和 `glassOctahedronDemo.ts` 的各 controller 中。

Notice 展示和日志输出通过 host 接口委托给 `OpenCodianView`，coordinator 自身不直接依赖 obsidian `Notice` 或 `createLogger`。

## 公开接口

```typescript
export interface ChatVisualDemoCoordinatorHost {
  getMessagesShellEl(): HTMLElement | null;
  showNotice(message: string): void;
  logWarn(message: string, ...args: unknown[]): void;
}

export class ChatVisualDemoCoordinator {
  constructor(host: ChatVisualDemoCoordinatorHost);
  toggleLiquidDiamondDemo(): void;
  toggleLiquidDiamondWebGlDemo(): void;
  toggleGlassOctahedron(): Promise<void>;
  destroyAll(): void;
}
```

## 关键行为

- `toggleLiquidDiamondDemo()` / `toggleLiquidDiamondWebGlDemo()` 实现两种 Liquid Diamond backend 的互斥切换
- `toggleGlassOctahedron()` 创建或切换 Glass Octahedron demo，处理 async init 和环境失败（通过 `host.showNotice()` 和 `host.logWarn()` 上报）
- `destroyAll()` 在 view close 时统一清理所有 demo controller
- 所有 demo controller 只在首次 toggle 时创建，destroy 后置 null
- 环境失败时的 Notice 展示和 logger 调用完全通过 host 接口委托，coordinator 无 obsidian/shared 直接导入

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 保留 `toggleLiquidDiamondDemo()`、`toggleLiquidDiamondWebGlDemo()`、`toggleGlassOctahedron()` 作为公开方法，内部委托给 coordinator
- view 在 `buildUI()` 中实例化 coordinator，传入 `showNotice`（包装 `new Notice()`）和 `logWarn`（包装 `logger.warn()`）
- view 在 `onClose()` 中调用 `destroyAll()`
- demo controller 的 DOM 创建、canvas 渲染、pointer 交互仍在各 demo 模块内
