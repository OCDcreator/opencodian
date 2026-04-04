# Shared Modals Barrel

> **源码**: `src/shared/modals/index.ts`
> **状态**: [DRAFT]

## 概述

共享弹窗模块的 barrel 入口，当前只暴露 fork 目标选择相关 API。它为上层提供一个较稳定的 import 路径，而不必直接引用 `ForkTargetModal.ts`。

## 导入关系

```text
上游: ./ForkTargetModal
下游: 聊天视图、fork 功能调用方
```

## 核心类型 / 接口

```typescript
export { chooseForkTarget, type ForkTarget } from './ForkTargetModal';
```

## 核心逻辑

### 共享弹窗收口

当前只有一个导出项，但它建立了 `shared/modals` 作为公共弹窗目录的公开边界。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `chooseForkTarget()` | 打开 fork 目标选择流程 |
| `ForkTarget` | fork 目标的返回类型 |

## 数据流

典型链路：业务模块调用 `chooseForkTarget()` -> 用户在弹窗中选择目标 -> 返回 `ForkTarget` 给调用方。

## 与其他模块的交互

- 具体实现见 [ForkTargetModal.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/shared/modals/ForkTargetModal.md)

## 配置项

无。

## 注意事项

- 如果未来新增更多共享弹窗，建议持续通过本 barrel 暴露，而不是让调用方依赖深层文件

## 待补充

- [ ] 记录共享弹窗的命名与导出约定

