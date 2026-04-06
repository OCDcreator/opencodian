# glassOctahedronDemoThree

> **源码**: `src/features/chat/glassOctahedronDemoThree.ts`
> **状态**: [REVIEW]

## 概述

`glassOctahedronDemoThree.ts` 是 glass octahedron 演示的 Three.js 渲染后端。它负责：

- 创建 `WebGLRenderer`
- 组装正八面体 mesh、内层 shell、fresnel shell
- 构造简单环境场景并用 PMREM 生成为环境贴图
- 根据 pose 渲染当前帧，并把结果转换成 `GlassOctahedronProjectionContext`

## 公开导出

```typescript
export type GlassOctahedronRenderQuality = 'interactive' | 'settled';

export interface GlassOctahedronPose {
  dpr: number;
  idleAmount: number;
  idlePhase: number;
  pitch: number;
  quality: GlassOctahedronRenderQuality;
  qualityTier: GlassOctahedronQualityTier;
  roll: number;
  yaw: number;
}

export interface GlassOctahedronThreeRenderer {
  destroy: () => void;
  render: (pose: GlassOctahedronPose) => GlassOctahedronProjectionContext;
}
```

## 核心逻辑

### 场景组装

渲染器内部会创建：

- 外层 `MeshPhysicalMaterial` 玻璃体
- 内层透明 shell
- 基于 `ShaderMaterial` 的 fresnel 壳层
- 环境房间、发光面板和几盏光源
- PMREM 生成的环境纹理

### 渲染

`render(pose)` 会：

- 按 pose 更新 DPR 和 transmission resolution
- 叠加 idle 浮动与姿态波动
- 微调 clearcoat / fresnel / opacity 等材质参数
- 调用 `renderer.render(scene, camera)`
- 最后调用 `createGlassOctahedronProjectionContext(...)` 返回 2D 投影数据

因此这个模块既负责“画 3D”，也负责向上层提供后续 refraction 层需要的 2D 投影语义。

### 资源释放

`destroy()` 会统一释放：

- geometry / material
- PMREM target 与 generator
- `WebGLRenderer`
- 如果支持，还会调用 `forceContextLoss()`

## 与其他模块的交互

- `vendor/three.ts`：通过 vendor bridge 引入 Three.js API
- `glassOctahedronDemoRefraction.ts`：提供几何半径和 projection context 工具
- `glassOctahedronDemo.ts`：主控制器动态导入并持有该 renderer

## 注意事项

- 该模块只负责渲染和投影，不处理用户拖拽或 overlay DOM。
- `render()` 的返回值会直接影响 refraction clip-path、caustic 和 displacement map。
