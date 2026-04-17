# Utils Icons Barrel

> **源码**: `src/utils/icons/index.ts`
> **状态**: [REVIEW]

## 概述

Provider 图标目录的公开 barrel。当前继续对外暴露 `ProviderIconService` 与 builtin registry 工具；`M4` 新增的 `providerIconEntryResolution.ts`、`providerIconBuiltinSelection.ts`、`providerIconCustomSources.ts`、`providerIconAssetCache.ts` 与 type-only `providerIconTypes.ts` 仍保持目录内私有协作，不直接从这里导出。

## 导入关系

```text
上游: ./builtinIconRegistry, ./ProviderIconService
下游: 设置界面、图标缓存管理、模型相关 UI
```

## 核心类型 / 接口

```typescript
export { ProviderIconService } from './ProviderIconService';
export {
  type BuiltinIconDefinition,
  type BuiltinIconLibraryId,
  findBuiltinIcon,
  formatBuiltinSource,
  getBuiltinIcon,
  listBuiltinIcons,
  parseBuiltinSource,
  PROVIDER_ICON_MAP,
  resolveBuiltinIconMatch,
  searchBuiltinIcons,
} from './builtinIconRegistry';
```

## 核心逻辑

### 公开导出面

- `ProviderIconService`：provider icon 的稳定公开 API
- `builtinIconRegistry` 导出：builtin provider 图标 registry / 搜索 / source 解析工具
- 新增 coarse modules 暂不通过此 barrel 暴露，避免把内部 maintainability seam 变成公共 API

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `ProviderIconService` | provider 图标读取、缓存与自定义资源管理服务 |
| `BuiltinIconLibraryId` / `BuiltinIconDefinition` | builtin 图标库元数据类型 |
| `searchBuiltinIcons()` / `resolveBuiltinIconMatch()` | builtin 图标搜索与推荐匹配 |

## 数据流

不适用。实际图标读写链路位于 `ProviderIconService` 内部。

## 与其他模块的交互

- 对应实现见 `docs/modules/utils/icons/ProviderIconService.md`

## 配置项

无直接配置。

## 注意事项

- 内部 coarse modules 仍应优先保持私有；只有在 3+ 外部 owner 需要时再考虑从此 barrel 暴露
