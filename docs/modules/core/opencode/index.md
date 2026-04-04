# Core OpenCode Barrel

> **源码**: `src/core/opencode/index.ts`
> **状态**: [DRAFT]

## 概述

`core/opencode` 目录的公开入口，聚合 OpenCode 服务门面、服务器生命周期管理、SDK rollout flag 以及对外暴露的类型。它定义了“插件侧愿意向上层公开的 OpenCode API 面”，而不是把目录内所有辅助实现都一并暴露出去。

## 导入关系

```text
上游: ./OpenCodeService, ./sdkFeatureFlags, ./ServerManager, ./types
下游: main.ts、设置面板、主视图、测试代码
```

## 核心类型 / 接口

```typescript
export type { SessionActivityStatus } from './OpenCodeService';
export { OpenCodeService } from './OpenCodeService';
export { resolveSdkFeatureFlags, SDK_FEATURE_FLAG_DISABLED_DEFAULTS, SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from './sdkFeatureFlags';
export { ServerManager } from './ServerManager';
export type { OpenCodeClientConfig, OpenCodeServerConfig, QueryOptions, ResponseHandler, SdkFeatureFlags, ServerError, ServerStatus } from './types';
```

## 核心逻辑

### 公开 API 收口

该 barrel 把上层需要的服务类、flag 和类型集中导出，隐藏 `sdkFetch`、`createSdkClient` 等更偏内部实现细节的模块。

### rollout 配置透传

`SDK_FEATURE_FLAG_DISABLED_DEFAULTS` 与 `SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS` 通过此文件向 `main.ts` 和测试暴露，用于控制 SDK v2 的启用范围。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `OpenCodeService` | OpenCode 能力门面 |
| `ServerManager` | 本地 OpenCode 进程生命周期管理 |
| `resolveSdkFeatureFlags()` | 组合运行时 SDK feature flags |
| `SdkFeatureFlags` 等类型 | 上层配置与状态类型约束 |

## 数据流

典型消费链路：

1. `main.ts` 或设置模块从本 barrel 导入 `OpenCodeService` / `ServerManager`
2. 上层根据设置构造服务实例
3. 服务内部再调用 `sdkFetch`、`createSdkClient`、`types` 等更细分实现

## 与其他模块的交互

- 与 [OpenCodeService.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/opencode/OpenCodeService.md) 和 [ServerManager.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/opencode/ServerManager.md) 共同构成 OpenCode 集成层
- 与 [sdkFeatureFlags.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/opencode/sdkFeatureFlags.md) 共享 rollout 语义

## 配置项

无直接配置，但导出的 `SdkFeatureFlags` 和 rollout 默认值会被运行时配置消费。

## 注意事项

- 该 barrel 当前只暴露“稳定入口”；内部辅助文件是否导出应保持克制
- 新增公开类型或服务时，需要考虑它是否真的属于稳定 API 面

## 待补充

- [ ] 补充哪些内部模块被有意保留为“非公开实现细节”

