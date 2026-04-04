# Core Types Barrel

> **源码**: `src/core/types/index.ts`
> **状态**: [DRAFT]

## 概述

OpenCodian 全局类型的主聚合入口。它把聊天、模型、设置、权限、OpenCode 配置等分散类型统一导出，供主视图、设置面板、服务层和工具层使用，是整个项目最重要的类型入口之一。

## 导入关系

```text
上游: ./chat, ./models, ./settings, ./tools, ./permission, ./opencodeConfig
下游: 几乎所有业务模块，尤其是 main.ts、OpenCodianView、OpenCodeService、设置 UI
```

## 核心类型 / 接口

```typescript
export { ... } from './chat';
export { ... } from './models';
export { ... } from './settings';
export { ... } from './tools';
export { ... } from './permission';
export { ... } from './opencodeConfig';
```

## 核心逻辑

### 类型分组聚合

该文件按主题分组 re-export：

- chat: 消息、会话、流式事件、上下文附件
- models: 模型提供商与上下文窗口信息
- settings: 默认设置、normalize 工具、主题与服务器配置
- tools: 工具调用数据结构
- permission: 权限请求与审批结构
- opencodeConfig: 本地 OpenCode 配置文件 schema

### 为上层提供稳定类型入口

调用方通常只需 import `../../core/types`，而不用深入每个子文件。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `createEmptyTabContextState` | 从 chat 类型模块暴露的上下文状态初始化函数 |
| `DEFAULT_SETTINGS` | 从 settings 模块暴露的默认配置 |
| `getDefaultThemeSettings()` 等 | 多组默认值与 normalize 工具 |
| 各类 `type` 导出 | 项目核心类型契约 |

## 数据流

不适用。该模块本身不参与运行时数据处理，但它定义了多条运行时数据流共享的类型边界。

## 与其他模块的交互

- 是 [chat.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/types/chat.md)、[models.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/types/models.md)、[settings.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/types/settings.md) 等子文档的聚合入口
- 与 `core/tools/index.ts` 共同提供“类型 + 常量”层的公开 API

## 配置项

无。

## 注意事项

- 这是高耦合入口，新增导出时要警惕循环依赖和 import 体积膨胀
- 这里既导出类型也导出少量函数/常量，文档中应明确哪些是纯类型、哪些有运行时值

## 待补充

- [ ] 统计当前最常被消费的导出分组
- [ ] 评估是否需要拆分更细的公共入口，降低单文件认知负担

