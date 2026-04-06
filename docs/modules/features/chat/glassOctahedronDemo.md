# glassOctahedronDemo

> **源码**: `src/features/chat/glassOctahedronDemo.ts`
> **状态**: [REVIEW]

## 概述

`glassOctahedronDemo.ts` 是实验性 glass octahedron overlay 的主控制器。它负责把三层能力装到一起：

- DOM / SVG / canvas 叠层与交互
- `glassOctahedronDemoThree.ts` 提供的 WebGL mesh 渲染
- `glassOctahedronDemoRefraction.ts` 提供的投影、折射和位移贴图工具

这个模块不接入稳定设置 UI，目前只由命令触发。

## 公开导出

```typescript
export const GLASS_OCTAHEDRON_DEMO_STAGE_SIZE = 220;

export class GlassOctahedronDemoController {
  constructor(parentEl: HTMLElement)
  isVisible(): boolean
  show(): Promise<void>
  destroy(): void
}
```

## 核心逻辑

### 显示与能力探测

`show()` 会：

1. 探测 backdrop-filter 基础支持和 URL filter 支持
2. 选择质量层级：`full-v3` / `light-v3` / `mesh-only`
3. 挂载 overlay、interaction layer、host、stage、caustic/refraction/canvas 层
4. 仅在 `full-v3` 时挂载 SVG displacement filter
5. 动态导入并创建 `createGlassOctahedronThreeRenderer(...)`

### 交互与渲染节奏

控制器维护：

- 拖拽与惯性
- interactive / settled 两档渲染质量
- idle / deep-idle 状态
- 根据慢帧情况自动降级质量层级

因此这个模块不仅仅是“点一次渲一次”，而是一个带性能退化策略的交互控制器。

### 视觉同步

每次渲染都会把投影上下文同步到三层视觉结果：

- `syncRefractionLayer()`：更新裁剪路径和 backdrop-filter
- `syncCausticLayer()`：更新底部光斑位置与大小
- `syncDisplacementMap()`：按需要重建 displacement snapshot

## 与其他模块的交互

- `OpenCodianView.ts`：创建并切换该控制器
- `glassOctahedronDemoThree.ts`：生成 3D octahedron mesh 与 pose 渲染
- `glassOctahedronDemoRefraction.ts`：生成投影上下文、位移图和 CSS filter 值

## 注意事项

- 这是实验性演示模块，不应意外暴露到常规设置路径。
- 质量层级会在运行时自动降级，因此视觉细节不是固定不变的。
- `destroy()` 负责真正的资源释放，`show()` 只负责挂载。
