# vendor/three

> **源码**: `src/vendor/three.ts`
> **状态**: [REVIEW]

## 概述

`src/vendor/three.ts` 是一个很薄的 vendor bridge。它把仓库内 `reference-projects/three.js/build/three.module.js` 里的少量 Three.js API 重新导出给主代码使用。

这样做的目的有两个：

- 主代码不需要到处直接引用 `reference-projects/...`
- 如果以后要收敛或替换导出面，只需要改这一层

## 导出面

当前导出的主要是 glass octahedron 渲染用到的 Three.js 类型和类，例如：

- `WebGLRenderer`
- `Scene`
- `PerspectiveCamera`
- `OctahedronGeometry`
- `Mesh`
- `MeshPhysicalMaterial`
- `ShaderMaterial`
- `PMREMGenerator`
- 光源、几何体、颜色空间和 tone mapping 常量

## 与其他模块的交互

- `glassOctahedronDemoThree.ts`：当前最主要消费者

## 注意事项

- 这是桥接层，不应该在这里堆业务逻辑。
- 除非任务明确要求，否则不要直接修改 `reference-projects/three.js/...`。
