# providerIconBuiltinSelection

> **源码**: `src/utils/icons/providerIconBuiltinSelection.ts`
> **状态**: [REVIEW]

## 概述

`providerIconBuiltinSelection` 是 provider icon 体系里的 builtin / LobeHub 选择 bundle。它统一管理 builtin option 列表、当前选中项、variant 解析、preview URL 候选，以及 LobeHub manifest 驱动的 fallback 顺序。

## 责任边界

- builtin picker 数据：生成推荐项、搜索结果、preview candidates 与 selected 状态
- LobeHub variant 选择：结合显式 variant、全局默认 variant、color mode 与 theme 推导静态资源候选
- preview 解析：统一 mapped / builtin entry 的 preview URL 与 previewCandidates
- builtin 持久化：选择 builtin 图标时，统一完成 entry 置顶、去重与 variant 落盘

## 公开接口

```typescript
export function listBuiltinIconOptions(
  app: App,
  providerId: string,
  library?: ProviderIconLibrary,
  options?: { query?: string; libraryId?: BuiltinIconLibraryId; requestedVariant?: LobehubIconVariant },
): BuiltinIconOption[];

export function selectBuiltinIcon(request: SelectBuiltinIconRequest): ProviderIconLibrary;
export function getSelectedBuiltinSource(providerId: string, library?: ProviderIconLibrary): string | null;
export function getPreviewUrlForLobehubIcon(
  iconId: string,
  requestedVariant: LobehubIconVariant,
  cacheDirectory?: string,
): LobehubIconPreviewState | null;
```

## 与其他模块的关系

- `ProviderBuiltinIconPickerModal` 通过 `ProviderIconService.listBuiltinIconOptions()` 间接消费这里的 preview/variant 结果
- `providerIconAssetCache.ts` 复用这里的 preview candidate、manifest variant、builtin asset-path 与 resolved-format 规则
- `providerIconEntryResolution.ts` 提供 builtin entry 写回所需的 resolution 与去重原语
- `lobehubIconManifest.ts` 继续作为所有 LobeHub variant 决策的单一静态数据源

## 注意事项

- 不要改变 LobeHub → builtin → custom 的总体 fallback 优先级；这里只负责 builtin/LobeHub 内部的候选顺序
- 新增 LobeHub variant 逻辑时，应优先扩展 manifest-based candidate 生成，不要在调用方手工拼 URL
