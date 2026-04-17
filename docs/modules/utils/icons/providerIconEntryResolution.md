# providerIconEntryResolution

> **源码**: `src/utils/icons/providerIconEntryResolution.ts`
> **状态**: [REVIEW]

## 概述

`providerIconEntryResolution` 负责 provider icon library 的 entry 解析与持久化边界：它把 provider-id 归一化、默认图标决策、library canonical key 解析、default-entry 合并，以及 entry 更新/删除逻辑集中到一个 coarse module 里。

## 责任边界

- provider icon id 解析：保留原有 5 级 `PROVIDER_ICON_MAP` 匹配策略
- default entry 决策：先走 mapped LobeHub 图标，再回退 builtin alias/search 命中
- library key 归一化：复用 canonical provider key，避免 `code xzh` / `codexzh` 之类的重复存储
- entry 持久化：统一处理 default-entry 持久化、去空、去重与删除

## 公开接口

```typescript
export function getProviderIconId(providerId: string): string | null;
export function resolveProviderEntryResolution(
  providerId: string,
  library: ProviderIconLibrary,
): ProviderIconEntryResolution | null;
export function persistDefaultProviderEntries(
  providerIds: string[],
  library: ProviderIconLibrary,
): ProviderIconLibrary;
export function updateProviderEntries(
  providerId: string,
  entries: ProviderIconEntry[],
  library: ProviderIconLibrary,
): ProviderIconLibrary;
```

## 与其他模块的关系

- `ProviderIconService.ts` 只保留公开入口，library entry 解析与写回全部委托给这里
- `providerIconBuiltinSelection.ts` 复用这里的 `resolveProviderEntryResolution()`、`createBuiltinEntry()` 与等价判定
- `providerIconAssetCache.ts` 通过这里拿到 runtime 所需的 selected/effective entries
- `ProviderIconCacheModal`、`ProviderBuiltinIconPickerModal` 继续通过 `ProviderIconService` 间接消费这些规则

## 注意事项

- 变更 fallback/provider-key 语义时，优先修改这里，不要在 UI 或 cache runtime 里重复拼相同规则
- 新增 builtin/default entry 形态时，保持 `effectiveEntries` 与 `editableEntries` 的分工不变
