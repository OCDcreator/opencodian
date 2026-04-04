# Shuding Liquid Glass 适配器

> **源码**: `src/utils/glass/adapters/shuding.ts`
> **状态**: [REVIEW]

## 概述

实现 "Shuding" 风格的毛玻璃效果适配器。通过 Canvas 生成位移贴图（displacement map），结合 SVG `<feDisplacementMap>` 滤镜和 CSS `backdrop-filter` 实现折射效果。支持自适应 SDF、矩形边缘折射、角落增强、桶形畸变、顶部高光、内边框、底部阴影、内凹深度阴影等可配置视觉层。

## 导入关系
上游: `../types` (`GlassAdapterSettingsValue`, `GlassEffectAdapter`, `GlassMountContext`)
下游: `../builtin-adapters` (注册), `../index` (re-export)

## 核心类型 / 接口

### ShudingSettings（内部）
19 个参数，涵盖折射（adaptiveSdf, rectEdgeRefraction, cornerEnhancement 等）、光照（topHighlight, innerBorder, bottomShadow 等）和滤镜（displacementScale, blurAmount, contrastBoost 等）三组。

### ShudingState（内部）
运行时状态，通过 `WeakMap<HTMLElement, ShudingState>` 按 shell 元素关联。包含 SVG 元素引用、Canvas、ResizeObserver、尺寸信息和样式快照。

### ShudingPanelGeometry（内部）
面板几何参数：`{ halfWidth, halfHeight, radius }`，用于 SDF 计算。

### ShudingTextureSample（内部）
位移纹理采样结果：`{ path, sampleX, sampleY }`，`path` 区分 strict-upstream / adaptive-upstream / enhanced 三种模式。

## 核心逻辑

### 三层渲染管线

1. **位移贴图层**（Canvas → SVG feImage）
   - `renderDisplacementMap()` 遍历每个像素，调用 `resolveDisplacementTextureSample()` 计算位移
   - 位移量编码到 R/G 通道，写入 Canvas 后转为 dataURL 赋给 `feImage`
   - 支持 strict-upstream（原始行为）、adaptive-upstream（自适应 SDF 混合）、enhanced（边缘折射+桶形畸变+角落增强）

2. **SVG 滤镜层**（feDisplacementMap）
   - `createState()` 构建 SVG `<defs>/<filter>/<feImage>/<feDisplacementMap>` 元素
   - 滤镜 ID 通过 `crypto.randomUUID()` 生成，避免冲突
   - 通过 `backdrop-filter: url(#filterId)` 应用位移效果

3. **CSS 效果层**（box-shadow）
   - `applyFilterLayerStyles()` 设置 blur、contrast、brightness、saturate 后处理
   - `buildFilterLayerBoxShadow()` 叠加 topHighlight、innerBorder、bottomShadow、insetDepthShadow

### 自适应 SDF

`resolvePanelGeometry()` 根据实际 shell 尺寸和 border-radius 计算面板几何，通过 `adaptiveSdfMix` 参数与上游固定几何做线性插值。

### 位移贴图更新策略

`shouldRegenerateDisplacementMap()` 仅在尺寸或关键参数变更时重新渲染 Canvas，避免不必要的计算。`displacementScale` 参数变更不触发重渲染，仅更新 `feDisplacementMap` 的 `scale` 属性。

### 状态快照与恢复

`captureStyleSnapshot()` / `restoreStyleSnapshot()` 和 `captureDatasetSnapshot()` / `restoreDatasetSnapshot()` 确保卸载时完全恢复原始 DOM 状态。

## 关键方法

| 方法 | 说明 |
|------|------|
| `mount(ctx, settings)` | 挂载效果，创建 SVG 滤镜和 Canvas |
| `unmount(ctx)` | 卸载效果，恢复所有 DOM 变更 |
| `updateSettings(ctx, settings)` | 增量更新参数，智能跳过不需要的位移贴图重渲染 |
| `resolveDisplacementTextureSample(ix, iy, geometry, settings)` | 核心位移计算（内部，导出用于测试） |
| `resolvePanelGeometry(state)` | 计算自适应面板几何（内部，导出用于测试） |
| `renderDisplacementMap(state)` | Canvas 像素级位移贴图渲染 |

## 数据流

```
mount(ctx, settings)
  → resolveSettings(settings)
  → createState(ctx, settings)  // SVG + Canvas + ResizeObserver
  → syncState(ctx, state, settings, { forceMapRegeneration: true })
    → renderDisplacementMap(state)    // Canvas → dataURL → feImage
    → updateDisplacementScale(state)  // feDisplacementMap.scale
    → applyShellStyles(shellEl)       // background: transparent
    → applyFilterLayerStyles(...)     // backdrop-filter + box-shadow

ResizeObserver → scheduleResizeSync → syncState (仅尺寸变更时重渲染)

updateSettings → syncState (检测参数变更决定是否重渲染位移贴图)

unmount → restoreStyleSnapshot → restoreDatasetSnapshot → disconnect ResizeObserver
```

## 与其他模块的交互

- **builtin-adapters.ts**: 注册此适配器（id: `'shuding'`）
- **OpenCodianView**: 调用 `mount`/`unmount`/`updateSettings`
- **OpenCodianSettings**: 根据 `paramDefs` 渲染 23 个参数控件，分 4 个 section（refraction / global / lighting / filter）

## 配置项

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `adaptiveSdf` | false | toggle | 启用自适应 SDF 几何 |
| `adaptiveSdfMix` | 0 | 0–1 | 自适应与固定几何混合比 |
| `rectEdgeRefraction` | false | toggle | 矩形边缘折射效果 |
| `rectEdgeRefractionStrength` | 0 | 0–2 | 边缘折射强度 |
| `cornerEnhancement` | false | toggle | 角落折射增强 |
| `cornerEnhancementStrength` | 0 | 0–2 | 角落增强强度 |
| `edgeBandWidth` | 0 | 0–0.2 | 边缘带宽 |
| `barrelDistortion` | false | toggle | 桶形畸变 |
| `barrelStrength` | 0 | 0–0.1 | 桶形畸变强度 |
| `topHighlight` | false | toggle | 顶部高光 |
| `topHighlightOpacity` | 0.6 | 0–1 | 高光透明度 |
| `innerBorder` | false | toggle | 内边框 |
| `innerBorderOpacity` | 0.2 | 0–1 | 边框透明度 |
| `bottomShadow` | false | toggle | 底部阴影 |
| `bottomShadowOpacity` | 0.08 | 0–1 | 阴影透明度 |
| `insetDepthShadow` | false | toggle | 内凹深度阴影 |
| `insetDepthShadowOpacity` | 0.12 | 0–1 | 深度阴影透明度 |
| `insetShadowBlur` | 10 | 5–30 | 深度阴影模糊半径 |
| `displacementScale` | 10 | 0–40 | 位移缩放因子 |
| `blurAmount` | 0.25 | 0–4 | 模糊量（px） |
| `contrastBoost` | 1.2 | 1–1.5 | 对比度增强 |
| `brightnessBoost` | 1.05 | 1–1.2 | 亮度增强 |
| `saturateBoost` | 1.1 | 1–1.3 | 饱和度增强 |

## 注意事项

- Canvas DPI 硬编码为 1，高 DPI 屏幕可能需要调整
- `supportsBackdropFilterUrl()` 结果在模块生命周期内缓存
- 位移贴图每像素计算复杂度较高，大尺寸面板可能影响性能
- 卸载时通过快照机制精确恢复原始 DOM 状态
