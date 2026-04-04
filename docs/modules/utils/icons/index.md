# Utils Icons Barrel

> **源码**: `src/utils/icons/index.ts`
> **状态**: [REVIEW]

## 概述

Provider 图标服务的目录级入口，当前只导出 `ProviderIconService`。它为设置页和模型配置相关 UI 提供统一的图标加载与缓存服务入口。

## 导入关系

```text
上游: ./ProviderIconService
下游: 设置界面、图标缓存管理、模型相关 UI
```

## 核心类型 / 接口

```typescript
export { ProviderIconService } from './ProviderIconService';
```

## 核心逻辑

### 单服务聚合

当前没有附加逻辑，仅作为 icons 子目录的稳定导出面。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `ProviderIconService` | provider 图标读取、缓存与自定义资源管理服务 |

## 数据流

不适用。实际图标读写链路位于 `ProviderIconService` 内部。

## 与其他模块的交互

- 对应实现见 [ProviderIconService.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/utils/icons/ProviderIconService.md)

## 配置项

无直接配置。

## 注意事项

- 如果 icons 目录未来新增其他公开工具，应同步扩充此 barrel


