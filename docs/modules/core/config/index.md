# Core Config Barrel

> **源码**: `src/core/config/index.ts`
> **状态**: [DRAFT]

## 概述

`core/config` 目录的 barrel 模块，为配置相关服务提供统一导出入口。它把模型配置、OpenCode 配置管理和插件配置管理聚合到一个稳定 import 路径下，减少上层模块直接依赖深层文件路径。

## 导入关系

```text
上游: ./ModelConfigService, ./OpencodeConfigManager, ./PluginManagementService
下游: main.ts、设置面板、测试或其他需要批量引入配置服务的模块
```

## 核心类型 / 接口

```typescript
export { ModelConfigService } from './ModelConfigService';
export { OpencodeConfigManager } from './OpencodeConfigManager';
export { PluginManagementService } from './PluginManagementService';
```

## 核心逻辑

### 配置服务聚合

该文件没有运行时业务逻辑，职责是把 `core/config` 下的三个主要服务收口为同一个导出面。

### 降低上层耦合

调用方可以从 `core/config` 一次性获得配置相关入口，而不必了解具体实现文件名。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `ModelConfigService` | 模型目录与本地模型配置服务 |
| `OpencodeConfigManager` | OpenCode 配置文件读写与管理 |
| `PluginManagementService` | 项目级插件来源与 `.opencode/plugins` 管理 |

## 数据流

不适用。该模块只做静态 re-export，典型消费链路为“上层模块 import barrel -> 再调用具体服务类”。

## 与其他模块的交互

- 与 [ModelConfigService.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/config/ModelConfigService.md)、[OpencodeConfigManager.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/config/OpencodeConfigManager.md)、[PluginManagementService.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/config/PluginManagementService.md) 组成同一组公开 API
- 上层若只需单个服务，也可以绕过 barrel 直接导入具体文件

## 配置项

无。配置项由下游具体服务负责。

## 注意事项

- 新增配置服务时，如果希望成为公开入口，应同步更新本文件和 [README.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/README.md)
- 删除或重命名导出会影响所有通过 barrel 导入的调用方

## 待补充

- [ ] 记录当前有哪些模块实际通过该 barrel 导入

