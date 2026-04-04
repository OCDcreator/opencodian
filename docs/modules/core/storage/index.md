# Core Storage Barrel

> **源码**: `src/core/storage/index.ts`
> **状态**: [DRAFT]

## 概述

存储层公开入口，当前只导出 `StorageService`。它让上层在需要本地会话、设置或资源持久化能力时，可以通过统一路径获取存储服务。

## 导入关系

```text
上游: ./StorageService
下游: main.ts、OpenCodianView、测试或其他需要持久化的模块
```

## 核心类型 / 接口

```typescript
export { StorageService } from './StorageService';
```

## 核心逻辑

### 存储服务收口

没有运行时逻辑，仅作为目录级公开入口暴露 `StorageService`。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `StorageService` | 会话、设置、图标与主题资源的本地持久化服务 |

## 数据流

不适用。真正的数据流位于 `StorageService` 内部；本文件仅参与导入链路。

## 与其他模块的交互

- 对应实现文档见 [StorageService.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/storage/StorageService.md)
- 调用方通常只需要 storage 公开入口，不关心其文件名

## 配置项

无。

## 注意事项

- 如果 storage 目录新增其他公开辅助函数，应同步更新本文件和总索引

## 待补充

- [ ] 补充目前 storage barrel 的主要消费方

