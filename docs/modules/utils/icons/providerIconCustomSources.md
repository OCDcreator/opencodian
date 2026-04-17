# providerIconCustomSources

> **源码**: `src/utils/icons/providerIconCustomSources.ts`
> **状态**: [REVIEW]

## 概述

`providerIconCustomSources` 收拢自定义图标来源相关的高风险逻辑：URL / 本地文件归一化、批量输入拆分、MIME 检测、大小限制，以及自定义资源首次缓存写入都集中在这里处理。

## 责任边界

- source normalization：只接受 `http(s)` URL、`file://` URL 或绝对本地路径
- batch parsing：支持按空格、逗号、换行拆分多个来源，同时保留带空格的本地路径
- MIME detection：按 header → SVG 内容 → 魔数 → 扩展名顺序检测图片类型
- custom cache bootstrap：首次添加自定义图标时生成 cache filename 并写入 `.opencodian/provider-icons/`

## 公开接口

```typescript
export function normalizeCustomSource(
  sourceInput: string,
  expectedType?: 'url' | 'file',
): NormalizedCustomSource;
export function splitCustomIconSourcesInput(sourceInput: string): string[];
export async function loadCustomSourceAsset(source: NormalizedCustomSource): Promise<LoadedIconAsset>;
export async function createCachedCustomEntry(
  providerId: string,
  source: NormalizedCustomSource,
  options: CreateCachedCustomEntryOptions,
): Promise<ProviderIconEntry>;
```

## 与其他模块的关系

- `ProviderIconService.ts` 通过这里完成 `addCustomIconSource()` 的 normalize + cache bootstrap
- `providerIconAssetCache.ts` 复用这里的 custom asset loader 与 MIME/path 识别能力
- `ProviderIconCacheModal` 的批量输入最终仍通过 `ProviderIconService.splitCustomIconSourcesInput()` 间接命中这里

## 注意事项

- 自定义来源校验是安全边界；不要把本地文件读取、远程下载或 MIME 放宽到 UI 层
- 若未来支持更多图片格式，应同时更新大小限制、扩展名映射和 cache/runtime 读取路径
