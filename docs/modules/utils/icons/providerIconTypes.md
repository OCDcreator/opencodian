# providerIconTypes

> **源码**: `src/utils/icons/providerIconTypes.ts`
> **状态**: [REVIEW]

## 概述

`providerIconTypes` 是 provider icon maintainability round 新增的类型契约模块。它集中承载 coarse provider-icon owners 之间共享的 public/internal contract，避免 `BuiltinSelection` 与 `AssetCache` 为了共享 shape 继续相互膨胀。

## 责任边界

- builtin selection contract：`BuiltinIconOption`、`SelectBuiltinIconRequest`、`LobehubIconPreviewState`
- asset/cache contract：`ProviderIconCacheEntry`、`ProviderIconProviderState`、`ProviderIconCacheSummary`、`ResolveIconUrlOptions`
- runtime seam contract：`ProviderIconAssetCandidate`、`ResolvedProviderIconAsset`、`ProviderIconEntryPreviewMetadata`
- shared variant type：`ResolvedLobehubVariant`

## 与其他模块的关系

- `providerIconBuiltinSelection.ts` 从这里复用 builtin picker 与 manifest preview 的对外类型
- `providerIconAssetCache.ts` 从这里复用 cache state / runtime candidate 契约
- `ProviderIconService.ts` 继续经由 builtin/cache bundle 间接 re-export 公开类型，不直接暴露这个内部 type owner

## 注意事项

- 这是类型契约模块，不应承载运行时代码
- 若 provider icon owner 之间新增共享 shape，优先扩充这里，而不是把类型重新塞回某个大型运行时模块
