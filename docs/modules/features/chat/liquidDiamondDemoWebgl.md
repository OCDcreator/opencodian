# liquidDiamondDemoWebgl

> **源码**: `src/features/chat/liquidDiamondDemoWebgl.ts`
> **状态**: [REVIEW]

## 概述

`liquidDiamondDemoWebgl.ts` 为 floating diamond demo 提供可选的 WebGL2 位移贴图后端。它不负责挂载 overlay，也不处理拖拽；职责是把当前钻石投影上下文渲染成一张编码位移偏移的 canvas 纹理。

这是 `liquidDiamondDemo.ts` 的兄弟模块，只在 backend 为 `'webgl'` 时启用。

## 公开导出

```typescript
export type LiquidDiamondDemoWebGlRenderer = {
  render: (context: DiamondContext, size: DiamondSize) => number;
  destroy: () => void;
};

export function createLiquidDiamondDemoWebGlRenderer(
  canvas: HTMLCanvasElement,
): LiquidDiamondDemoWebGlRenderer | null;
```

## 核心逻辑

### 初始化

`createLiquidDiamondDemoWebGlRenderer()` 会：

1. 检查浏览器是否具备 `WebGL2RenderingContext`
2. 创建 `webgl2` context
3. 编译顶点/片元着色器
4. 建立全屏四边形 VAO/VBO
5. 预填充金字塔晶体的面数据 uniform

如果任何一步失败，会记录诊断日志并返回 `null`，由上层回退。

### 着色器职责

片元着色器会：

- 对每个像素构造视线
- 与内部定义的金字塔晶体做相交、折射与反射追踪
- 计算背景命中点对应的 UV 偏移
- 把位移偏移编码到 RG 通道

返回给上层的不是最终视觉效果，而是一张供 `feDisplacementMap` 使用的位移图。

### 自适应位移范围

为了减少位移裁剪，这个模块没有完全把所有事情都放到 GPU。它会先通过 CPU 侧的：

- `traceDiamondRay()`
- `applyEdgeBulge()`

对 hull 周围做采样，估算当前帧需要的最大位移范围，再把这个范围传给 GPU 编码。

因此它是“GPU 渲染主链路 + CPU 自适应标尺估算”的混合设计。

## 与其他模块的交互

- `liquidDiamondDemo.ts`：在 WebGL backend 下创建并持有 renderer
- `utils/glass/adapters/shudingDiamond.ts`：复用钻石几何与 CPU 采样逻辑
- `OpenCodianView.ts`：通过 diamond demo 切换命令间接触发

## 注意事项

- 这是可选后端，不可用时应由调用方回退，不应让主聊天 UI 失败。
- `render()` 返回的是当前建议的 displacement scale，供上层同步到 `feDisplacementMap`。
- `destroy()` 只释放 WebGL 资源，不负责移除 overlay DOM。
