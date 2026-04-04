# Chat Feature Barrel

> **源码**: `src/features/chat/index.ts`
> **状态**: [REVIEW]

## 概述

`src/features/chat/index.ts` 是聊天功能目录的 barrel。它只做两件事：

- 显式导出 `OpenCodianView`
- 把 `./tabs` 的公开导出继续向上转发

这个文件本身没有运行时状态，也不参与聊天流程、渲染流程或服务通信。

## 导出面

```typescript
export { OpenCodianView } from './OpenCodianView';
export * from './tabs';
```

## 模块关系

- 上游来源：`./OpenCodianView`、`./tabs`
- 下游消费者：需要注册聊天视图或直接使用 tabs 类型/类的模块

## 事实约束

- 这个 barrel 没有转发 `chatAppearance`、`composerContext`、`renderGroups`、`services/*` 等同级辅助模块，它们目前仍然通过相对路径被 `OpenCodianView` 直接导入。
- `export * from './tabs'` 意味着 tabs 目录中新增或删除公开导出时，这里的公共 API 面会自动变化。
