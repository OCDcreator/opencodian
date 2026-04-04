# Nikdelvin Liquid Glass 适配器

> **源码**: `src/utils/glass/adapters/nikdelvin.ts`
> **状态**: [DRAFT]

## 概述

实现 "Nikdelvin" 风格的液态玻璃效果适配器。基于 SVG 位移滤镜 + 色差分离（chromatic aberration）实现折射效果，支持背景图片（含旋转动画）、玻璃着色（黑/白/透明）、自定义效果层（surface/highlight/spectrum）和交互式按钮模式。提供三档渲染模式自动降级：SVG（完整）→ Glass（CSS fallback）→ Overlay（纯装饰）。

## 导入关系
上游: `../types` (`GlassAdapterSettingsValue`, `GlassEffectAdapter`, `GlassMountContext`, `GlassParamDef`)
下游: `../builtin-adapters` (注册), `../index` (re-export)

## 核心类型 / 接口

### NikdelvinSettings（内部）
12 个参数：`depth`, `strength`, `chromaticAberration`, `blur`, `backgroundPreset`, `color`, `background`, `freeze`, `noMorph`, `button`, `inline`, `customEffects`。

### NikdelvinState（内部）
运行时状态，通过 `WeakMap<HTMLElement, NikdelvinState>` 按 shell 元素关联。包含 6 个 DOM 层元素（bgContainer, overlay, glassBox, surface, highlight, spectrum）、SVG defs、背景旋转动画状态和鼠标悬停状态。

### ShellMetrics（内部）
面板度量：`{ width, height, radius, effectiveDepth, filterSignature }`。`filterSignature` 用于检测参数变更避免不必要的 SVG 重建。

### RenderMode（内部）
`'svg' | 'glass' | 'overlay'`，根据 CSS 功能支持自动选择。

## 核心逻辑

### SVG 滤镜管线（色差分离）

`getDisplacementFilter()` 构建复杂 SVG 滤镜链：
1. `feImage` 加载位移贴图（SVG data URI）
2. 三次 `feDisplacementMap` 分别以不同 scale 位移 RGB 通道
3. 三次 `feColorMatrix` 分别提取 R/G/B 单通道
4. 两次 `feBlend(screen)` 合并三通道

色差效果通过三个不同 scale 值实现：`strength + chromaticAberration*2`（R）、`strength + chromaticAberration`（G）、`strength`（B）。

### 位移贴图生成

`getDisplacementMap()` 使用纯 SVG 构建 data URI：
- 两个 `linearGradient`（X/Y 方向）
- 内部矩形带 `border-radius` 和 `blur(depth)` 模拟 SDF 边缘

### 三档渲染模式

- **SVG 模式**: 支持 `backdrop-filter: url(#id)`，使用完整 SVG 滤镜链
- **Glass 模式**: 支持 `backdrop-filter: blur()` 但不支持 URL 引用，使用 CSS 模糊降级
- **Overlay 模式**: 不支持任何 backdrop-filter，仅渲染装饰性覆盖层

### 背景图片系统

- 5 个内置预设：background.webp, lines1.svg, rocks1.png, chrome1.png, silk1.png
- 自定义 URL 或本地文件路径
- 鼠标悬停时自动旋转（360°/20s），通过 `requestAnimationFrame` 驱动
- `freeze` 参数可暂停旋转

### 自定义效果层

`updateCustomEffectLayers()` 在 `customEffects=true` 时渲染三层：
1. **surface**: 线性渐变 + inset box-shadow（使用 CSS 变量 `--opencodian-composer-liquid-*`）
2. **highlight**: 径向渐变 + `mix-blend-mode: screen`
3. **spectrum**: 对角渐变 + 径向渐变，模拟光谱色散

### 交互式按钮模式

`button=true` 时启用：`scale(1.05) rotate(-1deg)` 悬停变换、`cursor: pointer`、过渡动画。

## 关键方法

| 方法 | 说明 |
|------|------|
| `mount(ctx, settings)` | 创建所有 DOM 层、事件监听和 ResizeObserver |
| `unmount(ctx)` | 清理全部 DOM 和事件 |
| `updateSettings(ctx, settings)` | 更新参数并重新渲染 |
| `renderState(state)` | 核心渲染函数，计算度量并更新所有层 |
| `syncFilterDefinition(state, metrics)` | 按需重建 SVG 滤镜 |
| `syncBackgroundSpin(state)` | 管理背景旋转动画 |

## 数据流

```
mount(ctx, settings)
  → createState(ctx, settings)
    → 创建 SVG defs + 6 个 DOM 层
    → 注册 mouseenter/mouseleave
    → 创建 ResizeObserver
  → syncStateContext(state, ctx)
  → renderState(state)
    → readShellMetrics(state) → 计算度量 + filterSignature
    → syncFilterDefinition(state, metrics)  // 仅 SVG 模式
    → updateBaseLayers(state, metrics, mode)
    → updateCustomEffectLayers(state, mode)
    → applyShellInteractiveStyles(state)

鼠标悬停 → isHovered=true → syncBackgroundSpin → requestAnimationFrame 循环
  → stepBackgroundSpin → 更新 spinRotation → updateBackgroundTransform

unmount → stopBackgroundSpin → disconnect observer → cleanupInstanceArtifacts
```

## 与其他模块的交互

- **builtin-adapters.ts**: 注册此适配器（id: `'nikdelvin'`）
- **OpenCodianView**: 调用 `mount`/`unmount`/`updateSettings`
- **OpenCodianSettings**: 根据 `paramDefs` 渲染 12 个参数控件，分 5 个 section（refraction / appearance / behavior / extras）
- **GlassMountContext.resolveAssetUrl**: 用于解析 `assets/liquid-glass/nikdelvin/*` 资源路径

## 配置项

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `depth` | 10 | 0–40 | 位移贴图内凹深度 |
| `strength` | 100 | 0–200 | 位移强度 |
| `chromaticAberration` | 0 | 0–10 | 色差分离量 |
| `blur` | 0 | 0–10 | 额外模糊 |
| `backgroundPreset` | `'background'` | select | 背景预设选择 |
| `color` | `'transparent'` | select | 玻璃着色 |
| `background` | `''` | text | 自定义背景 URL/路径 |
| `freeze` | false | toggle | 冻结背景旋转 |
| `noMorph` | false | toggle | 禁用形态变化 |
| `button` | false | toggle | 按钮交互模式 |
| `inline` | false | toggle | 内联显示模式 |
| `customEffects` | false | toggle | 启用 surface/highlight/spectrum 效果层 |

## 注意事项

- 资源路径通过 `GlassMountContext.resolveAssetUrl` 解析，需要上层提供此回调
- SVG 滤镜通过 `filterSignature` 做缓存，避免每次 render 都重建 DOM
- 背景旋转仅在鼠标悬停时启动，离开时停止
- `cleanupInstanceArtifacts()` 使用 `querySelectorAll` 按自定义 data attribute 清理
- 实例 ID 通过递增计数器生成，不使用 UUID

## 待补充
- [ ] 内置背景资源文件列表和尺寸
- [ ] CSS 变量 `--opencodian-composer-liquid-*` 的完整定义
- [ ] `inline` 模式的布局行为详细说明
