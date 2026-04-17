# providerIconAssetCache

> **源码**: `src/utils/icons/providerIconAssetCache.ts`
> **状态**: [REVIEW]

## 概述

`providerIconAssetCache` 是 provider icon runtime 的 asset/cache owner。它统一管理内存 runtime state、cache-only 预览检查、远程/本地资源加载、vault cache 读写，以及缓存总览与预热流程。

## 责任边界

- runtime state：维护 `loggedIconUrls`、`resolvedIconUrls`、`inFlightIconLoads`、`failedIconIds`
- asset resolution：按 mapped/LobeHub builtin、bundled builtin、custom entry 三类入口装配 candidate 并执行统一加载流程
- cache runtime：处理 cache hit、cache miss 下载、vault 写回、cache-only preview fallback
- cache operations：提供 cache summary、warm-up 与 clear-cache 入口

## 公开接口

```typescript
export async function resolveProviderIconUrl(
  app: App,
  providerId: string,
  library?: ProviderIconLibrary,
  options?: ResolveIconUrlOptions,
): Promise<string | null>;

export async function getProviderIconCacheState(
  app: App,
  currentProviderIds: string[],
  library?: ProviderIconLibrary,
): Promise<{ providers: ProviderIconProviderState[]; summary: ProviderIconCacheSummary }>;

export async function clearProviderIconCache(app: App): Promise<number>;
export async function warmProviderIcons(
  app: App,
  providerIds: string[],
  library?: ProviderIconLibrary,
): Promise<{ total: number; supported: number; cached: number; failed: number }>;
```

## 与其他模块的关系

- `ProviderIconService.ts` 只保留公开 orchestration，实际 runtime/cache 逻辑都委托给这里
- `providerIconBuiltinSelection.ts` 提供 LobeHub/builtin preview candidates、manifest format 与 asset path
- `providerIconCustomSources.ts` 提供 custom source 读取、MIME 检测和路径回退能力
- `ProviderIconCacheModal`、`SettingsModelIconCacheManager` 继续经由 `ProviderIconService` 间接消费 cache state / warm / clear

## 注意事项

- `cacheOnly` 路径只能读取已有缓存并回退 preview URL，不能偷偷触发真实下载
- 修改 runtime key、failed set 或 cachePath 规则时，要同步关注 warm-up、clear-cache 和测试里的缓存命名断言
