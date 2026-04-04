# Chat Feature Barrel

> **源码**: `src/features/chat/index.ts`
> **状态**: [DRAFT]

## 概述

聊天功能层的目录级公开入口，聚合主视图 `OpenCodianView` 与多标签子系统导出。它把聊天相关的顶层 API 收口为 `features/chat` 一个稳定入口，便于主入口或其他模块导入。

## 导入关系

```text
上游: ./OpenCodianView, ./tabs
下游: main.ts、测试或其他需要装配聊天视图的模块
```

## 核心类型 / 接口

```typescript
export { OpenCodianView } from './OpenCodianView';
export * from './tabs';
```

## 核心逻辑

### 主视图与标签子系统聚合

该 barrel 把聊天功能的两个顶层面向上层的出口合并在一起：

- `OpenCodianView`: 聊天 UI 主体
- `tabs/*`: 多标签运行时与类型

### 隐藏子目录细节

上层模块不需要知道 tabs 目录内部再拆成 `Tab`、`TabBar`、`TabManager` 等多个文件。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `OpenCodianView` | 聊天主视图 |
| `Tab` / `TabBar` / `TabManager` | 多标签系统导出，经 `./tabs` 继续转发 |

## 数据流

典型链路：主入口注册 view -> 从本 barrel 导入 `OpenCodianView` -> 视图内部再使用 tabs 子系统管理多会话状态。

## 与其他模块的交互

- 主视图实现见 [OpenCodianView.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/OpenCodianView.md)
- tabs 聚合说明见 [tabs/index.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/chat/tabs/index.md)

## 配置项

无直接配置。

## 注意事项

- 该 barrel 使用 `export * from './tabs'`，新增 tabs 导出会自动扩散到这里

## 待补充

- [ ] 记录当前有哪些地方直接从 `features/chat` 导入

