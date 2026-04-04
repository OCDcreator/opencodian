# Liquid Diamond Demo WebGL

> **源码**: `src/features/chat/liquidDiamondDemoWebgl.ts`
> **状态**: [DRAFT]

## 概述

聊天界面里的 WebGL 版 Liquid Diamond 演示控制器。它共享 diamond 几何上下文，但把视觉主体改为 WebGL shader 渲染，并在启动时自动在 facet shader 与 compat shader 之间降级选择，用于展示更强的发光和晶体质感效果。

## 导入关系

```text
上游: ../../utils/glass/adapters/shudingDiamond, ./liquidDiamondDemo
下游: OpenCodianView
```

## 核心类型 / 接口

```typescript
export class LiquidDiamondDemoWebglController {
  isVisible(): boolean;
  show(): void;
  hide(): void;
  toggle(): void;
  destroy(): void;
}
```

## 核心逻辑

### WebGL 资源初始化

`createWebGlResources()` 会先尝试构建 facet shader 程序，失败时退回 compat 版本。状态对象持有 `gl`、program、buffer、uniform location 等资源。

### 共享 diamond 几何

渲染过程同样依赖 `createDiamondContext()`，但会把 hull、face points、opacity 等信息 flatten 成 `Float32Array`，写入 shader uniform。

### 拖拽与惯性

交互层仍使用 pointer 事件和弹性边界，整体行为与 DOM 版 demo 保持一致，方便在 `OpenCodianView` 中切换不同演示风格。

### 资源清理

`destroyState()` 负责取消动画帧、解绑事件、释放 WebGL buffer/program，并移除 overlay，防止调试演示反复开关后泄漏 GPU 资源。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `show()` | 创建 WebGL demo 场景并初始化 shader |
| `hide()` | 销毁场景与 WebGL 资源 |
| `toggle()` | 显示/隐藏切换 |
| `destroy()` | 对外销毁入口 |

## 数据流

1. `OpenCodianView` 创建 `LiquidDiamondDemoWebglController`
2. `show()` -> `createState(parentEl)` -> 初始化 WebGL 资源
3. pointer / resize 改变 demo 位置
4. `renderScene()` 调用 `renderWebGlScene()`，把几何信息写入 uniform 并 `drawArrays`
5. `hide()` / `destroy()` 释放资源并移除 DOM

## 与其他模块的交互

- 复用 [liquidDiamondDemo.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/liquidDiamondDemo.md) 导出的 `LIQUID_DIAMOND_DEMO_STAGE_SIZE`
- 依赖 `shudingDiamond` 提供几何上下文
- 被 `OpenCodianView` 中的 WebGL demo 开关路径调用

## 配置项

无直接设置项。

## 注意事项

- 与 DOM 版相比，这个模块额外管理 GPU 资源，清理路径更敏感
- shader 采用 facet -> compat 的降级策略，修改视觉逻辑时要同时考虑两条渲染路径
- 在不支持或异常环境下创建 WebGL 资源可能失败，调用方已用 try/catch 做保护

## 待补充

- [ ] 补充 facet shader 与 compat shader 的视觉职责差异
- [ ] 记录 OpenCodianView 中的调用与错误兜底路径

