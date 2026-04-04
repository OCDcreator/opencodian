# Liquid Diamond Demo

> **源码**: `src/features/chat/liquidDiamondDemo.ts`
> **状态**: [DRAFT]

## 概述

聊天界面里的 DOM/SVG/Canvas 版 Liquid Diamond 演示控制器。它使用 `shudingDiamond` 适配器提供的几何投影与折射辅助函数，在消息壳层上挂载一个可拖拽、带惯性和弹性边界的视觉 demo，用于调试或展示 Liquid Glass / diamond 效果。

## 导入关系

```text
上游: ../../utils/glass/adapters/shudingDiamond
下游: OpenCodianView
```

## 核心类型 / 接口

```typescript
export const LIQUID_DIAMOND_DEMO_STAGE_SIZE = 220;

export class LiquidDiamondDemoController {
  isVisible(): boolean;
  show(): void;
  hide(): void;
  toggle(): void;
  destroy(): void;
}
```

## 核心逻辑

### Overlay 与场景搭建

`createState()` 会创建 overlay、interaction layer、host、SVG filter、canvas、crystal/rim/bloom 等 DOM 结构，并把 demo 挂到传入的 `parentEl` 下。

### 几何投影与折射

渲染时通过 `createDiamondContext()`、`traceDiamondRay()`、`applyEdgeBulge()` 计算 diamond 外形、面片与折射视觉，再同步更新 SVG filter、canvas 位移图和表层装饰。

### 交互惯性

pointer 事件驱动拖拽，释放后进入惯性动画；边界通过 `elasticPosition()` 和 spring/damping 参数回弹，保持视觉上可拖动但不会永久跑出容器。

### 渲染质量分级

拖动中使用较低 DPI 的 `interactive` 渲染，静止后回到 `settled` 渲染，以平衡流畅度与清晰度。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `LIQUID_DIAMOND_DEMO_STAGE_SIZE` | demo 固定舞台尺寸常量 |
| `show()` | 创建场景并挂载 demo |
| `hide()` | 销毁场景、解绑事件、移除 DOM |
| `toggle()` | 在显示与隐藏之间切换 |
| `destroy()` | 对外销毁入口，内部复用 `hide()` |

## 数据流

1. `OpenCodianView` 创建 `LiquidDiamondDemoController`
2. `show()` 调用 `createState(parentEl)`
3. pointer / resize 事件更新 `x/y/vx/vy`
4. `renderScene()` 基于 `shudingDiamond` 几何上下文更新 SVG 与 canvas
5. `hide()` / `destroy()` 取消动画帧、解绑事件并移除 overlay

## 与其他模块的交互

- 依赖 `shudingDiamond` 提供的 diamond 几何与折射辅助能力
- 被 [OpenCodianView.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/OpenCodianView.md) 用于 demo 开关逻辑
- 与 [liquidDiamondDemoWebgl.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/liquidDiamondDemoWebgl.md) 形成两套同主题 demo 实现

## 配置项

无直接设置项，主要由内部常量控制物理与渲染参数。

## 注意事项

- 这是 feature 目录下的辅助 demo，不是普通聊天主流程，但它真实接入 `OpenCodianView`，修改时不能当作完全独立脚本
- 该实现创建了较多 DOM / pointer / animation frame 资源，销毁路径必须完整
- `LIQUID_DIAMOND_DEMO_STAGE_SIZE` 还会被 WebGL 版本复用

## 待补充

- [ ] 记录当前 view 里有哪些命令或调试入口能触发该 demo
- [ ] 补充 SVG filter 与 canvas 位移图的更新关系

