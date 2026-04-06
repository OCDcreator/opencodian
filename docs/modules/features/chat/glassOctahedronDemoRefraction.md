# glassOctahedronDemoRefraction

> **源码**: `src/features/chat/glassOctahedronDemoRefraction.ts`
> **状态**: [REVIEW]

## 概述

`glassOctahedronDemoRefraction.ts` 是 glass octahedron 演示的数学与位移图工具层。它本身不管理 overlay 生命周期，而是提供：

- 正八面体几何投影
- 折射/反射追踪
- displacement snapshot 生成
- backdrop-filter 支持探测与 filter 字符串构造

## 核心导出

- `GlassOctahedronQualityTier`
- `GlassOctahedronRenderQuality`
- `GlassOctahedronProjectionContext`
- `GlassOctahedronBackdropSupport`
- `GlassOctahedronTransform`
- `GLASS_OCTAHEDRON_GEOMETRY_RADIUS`
- `detectGlassOctahedronBackdropSupport()`
- `buildGlassOctahedronBackdropFilterValue()`
- `buildGlassOctahedronLightBackdropFilterValue()`
- `createGlassOctahedronProjectionContext()`
- `renderGlassOctahedronDisplacementSnapshot()`
- `__testing`

## 核心逻辑

### 投影上下文

`createGlassOctahedronProjectionContext(...)` 会根据当前 transform 和 stage size 计算：

- hull
- bounds
- center
- projectedFaces
- clipPath
- displacementStrength

这个 `ProjectionContext` 是上层控制器同步 refraction、caustic 和 displacement map 的中心数据结构。

### 折射与位移图

模块内部实现了一套几何追踪：

- 视线与正八面体三角面求交
- 入射/出射折射或反射
- 命中背景平面后的 UV 位移计算

`renderGlassOctahedronDisplacementSnapshot(...)` 会把这些位移编码成 2D canvas 的 RG 通道图，并返回：

- `dataUrl`
- `filterScale`

只有 `qualityTier === 'full-v3'` 时才会生成 displacement snapshot。

### backdrop 支持探测

`detectGlassOctahedronBackdropSupport()` 同时检查：

- 基础 blur/brightness 型 `backdrop-filter`
- `url(#filter)` 型 SVG backdrop filter

上层控制器据此决定使用 `full-v3`、`light-v3` 还是 `mesh-only`。

## 与其他模块的交互

- `glassOctahedronDemo.ts`：主控制器，直接消费本模块的大部分导出
- `glassOctahedronDemoThree.ts`：渲染 mesh 后再调用这里生成 projection context
- 单元测试：通过 `__testing` 暴露关键纯函数

## 注意事项

- 这里的核心价值是“几何和位移图”，不是 DOM。
- `renderGlassOctahedronDisplacementSnapshot()` 依赖 2D canvas API；不可用时上层必须降级。
