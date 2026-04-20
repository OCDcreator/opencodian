# JSX Shim

> **源码**: `src/types/jsx-shim.ts`
> **状态**: [REVIEW]

## 概述

`jsx-shim.ts` 为项目声明最小 JSX namespace，使 TypeScript 能理解 `.tsx` / JSX 语法而不把项目绑定到 React 类型。它是类型补丁文件，没有运行时代码。

## 导入关系

```text
上游: TypeScript global namespace
下游: TypeScript compiler / JSX 类型检查
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `JSX.Element` | 统一声明为 `unknown` |
| `JSX.ElementClass` | 允许类组件有可选 `render` |
| `JSX.ElementType` | 允许字符串、函数组件或类组件 |
| `JSX.IntrinsicElements` | 允许任意标签名与属性 record |

文件末尾 `export {}` 只用于把该文件标记为 module，同时保留 `declare global` 生效。

## 核心逻辑

不适用。该文件只提供编译期声明。

## 数据流

```text
TypeScript 编译
  → 加载 src/types/jsx-shim.ts
  → JSX namespace 可用
  → JSX/TSX 文件通过基础类型检查
```

## 与其他模块的交互

无直接 import/export 消费方。它通过 TypeScript 项目编译上下文全局生效。

## 配置项

无。

## 注意事项

- 这里故意保持宽松声明，避免引入 React 类型依赖。
- 如果未来项目改用更严格的 JSX runtime，需要同步评估此 shim 是否仍适合。
