# ChatVisualDemoCoordinator

> **源码**: `src/features/chat/services/ChatVisualDemoCoordinator.ts`

## 概述

`ChatVisualDemoCoordinator` 把 `OpenCodianView` 里 Liquid Diamond（CPU + WebGL）和 Glass Octahedron 两种实验性 visual demo 的 toggle、互斥、destroy 和环境失败 Notice 收束到一个独立 owner。

它不负责 demo 的渲染算法；渲染仍在 `liquidDiamondDemo.ts`、`liquidDiamondDemoWebgl.ts` 和 `glassOctahedronDemo.ts` 的各 controller 中。

## 公开接口

```typescript
export interface ChatVisualDemoCoordinatorHost {
  getMessagesShellEl(): HTMLElement | null;
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
- `toggleGlassOctahedron()` 创建或切换 Glass Octahedron demo，处理 async init 和环境失败 Notice
- `destroyAll()` 在 view close 时统一清理所有 demo controller
- 所有 demo controller 只在首次 toggle 时创建，destroy 后置 null

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 保留 `toggleLiquidDiamondDemo()`、`toggleLiquidDiamondWebGlDemo()`、`toggleGlassOctahedron()` 作为公开方法，内部委托给 coordinator
- view 只在 `buildUI()` 中实例化 coordinator，在 `onClose()` 中调用 `destroyAll()`
- demo controller 的 DOM 创建、canvas 渲染、pointer 交互仍在各 demo 模块内
