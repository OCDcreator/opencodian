# Liquid Diamond Demo

> **源码**: `src/features/chat/liquidDiamondDemo.ts`
> **状态**: [REVIEW]

## 概述

这是一个挂载在聊天消息壳层上的实验性视觉控制器。它不是聊天主流程的一部分，但确实由 `OpenCodianView.toggleLiquidDiamondDemo()` 直接创建和销毁。

实现方式是：

- 用 `shudingDiamond` 提供的几何和折射计算函数生成 diamond 上下文
- 用 `canvas` 生成位移贴图
- 用 SVG `feDisplacementMap` 和 CSS `backdrop-filter` 组合出“液态折射”效果
- 用 DOM 指针事件实现拖拽、惯性和边界回弹

## 公开导出

```typescript
export const LIQUID_DIAMOND_DEMO_STAGE_SIZE = 220;

export class LiquidDiamondDemoController {
  constructor(parentEl: HTMLElement)
  isVisible(): boolean
  show(): void
  hide(): void
  toggle(): void
  destroy(): void
}
```

## 关键行为

### 场景创建

`show()` 首次调用时会通过内部 `createState(parentEl)` 生成完整场景：

- overlay / interaction layer / host DOM
- SVG `filter`、`feImage`、`feDisplacementMap`
- `canvas` 和 2D 上下文
- `bloom`、`rim`、`crystal`、`face overlay` 等视觉层

### 渲染分级

模块维护两种渲染质量：

- `interactive`：拖动时使用较低 DPI，加快重绘
- `settled`：静止后回到较高 DPI，提高细节

### 指针交互

拖动逻辑保存在内部 `DemoState`：

- `pointerdown` 开始拖动并尝试 `setPointerCapture`
- `pointermove` 更新 `x/y` 和速度
- `pointerup` 结束拖动，若有速度则进入惯性动画
- `tickInertia()` 会叠加阻尼、弹簧回弹和边界限制

### 位移贴图与外观层

`renderScene()` 会：

- 由 `createDiamondContext()` 构建当前视角下的 diamond 几何
- 通过 `traceDiamondRay()` 和 `applyEdgeBulge()` 生成位移数据
- 把位移数据写入 canvas，再转成 data URL 提供给 `feImage`
- 用 `renderVisualLayers()` 同步 bloom、rim、crystal、face overlay 的样式

## 模块关系

- 上游依赖：`../../utils/glass/adapters/shudingDiamond`
- 下游消费者：`OpenCodianView`

## 注意事项

- `destroy()` 只是对外销毁入口，内部直接复用 `hide()`。
- `hide()` 会取消动画帧、移除事件监听、释放指针捕获并删除 overlay；这个清理路径是真正的资源回收点。
- 控制器本身没有配置持久化，也没有和插件设置联动。
