# Shuding Diamond Liquid Crystal 适配器

> **源码**: `src/utils/glass/adapters/shudingDiamond.ts`
> **状态**: [REVIEW]

## 概述

实现 "Shuding Diamond" 钻石切割液晶效果适配器。通过 3D 金字塔几何体的光线追踪（refraction/reflection）生成位移贴图，叠加 bloom 光晕、rim light 边缘光、crystal 晶体层和 SVG 面片叠加，创建棱镜色散视觉效果。支持指针追踪，使晶体根据鼠标位置倾斜旋转。

**当前状态**: 已从 `builtin-adapters.ts` 中移除注册，代码保留但默认不可用。

## 导入关系
上游: `../types` (`GlassAdapterSettingsValue`, `GlassEffectAdapter`, `GlassMountContext`, `GlassParamDef`)
下游: `../builtin-adapters`（已移除注册）

## 核心类型 / 接口

### DiamondSettings（内部）
7 个参数：`displacementScale`, `bloomOpacity`, `rimOpacity`, `faceOverlayOpacity`, `supportOpacity`, `pointerTracking`, `pointerTilt`。

### DiamondState（内部）
运行时状态，通过 `WeakMap<HTMLElement, DiamondState>` 按 shell 元素关联。包含 SVG 滤镜、Canvas、5 个视觉层元素（root, support, bloom, crystal, rim, faceSvg）、动画状态（currentTheta/Phi, targetTheta/Phi）和指针事件处理器。

### DiamondContext（内部）
计算上下文：theta/phi 旋转变换 + 投影凸包 + 面片列表 + bloom 锚点 + 边列表 + clip-path。

### DiamondDisplacementTrace（内部）
光线追踪结果：`{ displacedUv: { x, y } }`。

### 导出类型
`DiamondContext`, `DiamondDisplacementTrace`, `DiamondPoint`, `DiamondProjectedFace`, `DiamondSize`

## 核心逻辑

### 3D 光线追踪管线

1. **金字塔几何**: 5 面金字塔（1 顶点 + 4 底顶点），通过 `PYRAMID_VERTICES` / `PYRAMID_PLANES` / `PYRAMID_FACES` 定义
2. **光线求交**: `intersectCrystalFaces()` 对 5 个三角面做 Möller–Trumbore 求交
3. **折射/反射**: `resolveTransmissionDirection()` 使用 Snell 定律（IOR=1.18），支持全内反射回退
4. **内部弹跳**: 最多 `MAX_INTERNAL_BOUNCES=8` 次内壁反射
5. **位移计算**: `buildDisplacementTrace()` 将出射光线投射到背景平面，计算 UV 偏移
6. **边缘膨胀**: `applyEdgeBulge()` 在凸包边缘附近添加向心位移

### 投影与凸包

- `createProjectedHull()` 将 3D 顶点投影到 2D 并计算凸包（Andrew's monotone chain 算法）
- `createProjectedFaces()` 生成面片投影，根据法向量朝向计算透明度
- 凸包 clip-path 用于 bloom、crystal 和 rim 层的裁剪

### 指针追踪动画

- `updateTargetFromPointer()` 将鼠标位置映射到 theta/phi 目标值
- `updateAnimatedOrientation()` 使用指数平滑（系数 0.18）插值当前角度
- `resetPointerOrientation()` 在鼠标离开时恢复默认角度（theta=0.64, phi=-0.42）

### 多层视觉渲染

`renderVisualLayers()` 按顺序设置：
1. **support 层**: 渐变背景 + box-shadow + backdrop-filter
2. **bloom 层**: 多个径向渐变 + blur(30px) + clip-path 裁剪
3. **crystal 层**: 线性渐变 + SVG 滤镜 backdrop-filter + inset box-shadow
4. **rim 层**: 渐变 + drop-shadow 发光效果
5. **face overlay**: SVG 多边形面片 + 凸包轮廓

### CSS 功能检测

`supportsBackdropFilterUrl()` 检测浏览器是否支持 `backdrop-filter: url(#id)` 语法，不支持时使用 `blur(10px)` 降级。

## 关键方法

| 方法 | 说明 |
|------|------|
| `mount(ctx, settings)` | 创建所有 DOM 层、事件监听和 ResizeObserver |
| `unmount(ctx)` | 清理全部 DOM、事件和动画 |
| `updateSettings(ctx, settings)` | 更新参数并重新渲染 |
| `traceDiamondRay(uv, context, size)` | 核心光线追踪（导出用于测试） |
| `createDiamondContext(theta, phi, size)` | 构建投影上下文（导出用于测试） |
| `convexHull(points)` | Andrew's 凸包算法（导出用于测试） |
| `refractVector(incident, normal, ratio)` | Snell 定律折射（导出用于测试） |
| `reflectVector(incident, normal)` | 反射向量（导出用于测试） |

## 数据流

```
mount(ctx, settings)
  → createState(ctx, settings)
    → 创建 SVG defs/filter/feImage/feDisplacementMap
    → 创建 5 个视觉层 div + faceSvg
    → 注册 pointermove/pointerleave 事件
    → 创建 ResizeObserver
  → renderState(state)
    → renderDisplacementMap(state, context)  // Canvas 光追
    → updateDisplacementScale(state)
    → renderVisualLayers(state, context)     // CSS 层叠
    → renderFaceOverlay(state, context)      // SVG 面片

指针移动 → updateTargetFromPointer → scheduleAnimatedOrientation
  → requestAnimationFrame → updateAnimatedOrientation
    → 0.18 线性插值 → renderState → ...

unmount → cleanupState → disconnect observer + cancel animation + remove DOM
```

## 与其他模块的交互

- **builtin-adapters.ts**: 已移除注册（适配器代码保留）
- 可通过手动调用 `registerGlassAdapter(adapter)` 重新启用

## 配置项

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `displacementScale` | 10 | 0–40 | 位移缩放因子 |
| `bloomOpacity` | 1 | 0–1 | 光晕层透明度 |
| `rimOpacity` | 0.45 | 0–1 | 边缘光透明度 |
| `faceOverlayOpacity` | 1 | 0–1 | 面片叠加透明度 |
| `supportOpacity` | 0.88 | 0–1 | 底层背景透明度 |
| `pointerTracking` | true | toggle | 启用指针追踪 |
| `pointerTilt` | 1 | 0–2 | 指针追踪灵敏度 |

## 注意事项

- IOR（折射率）硬编码为 1.18
- 光追计算量与面板面积成正比，大面板性能开销较大
- 指针追踪使用 `requestAnimationFrame` 动画循环，在活跃时持续消耗帧
- 金字塔缩放因子 `SHAPE_SCALE = 0.9`，顶点坐标硬编码
- `__testing` 导出用于单元测试，包含所有核心算法函数
