# LobeHub Icon Manifest

> **源码**: `src/utils/icons/lobehubIconManifest.ts`
> **状态**: [REVIEW]

## 概述

`lobehubIconManifest.ts` 是由 `npm run sync:lobehub-icons` 生成的 LobeHub 图标清单。它描述每个图标的分组、标题、颜色、静态格式支持和远程资源 URL，供 builtin icon registry 构建搜索和选择数据。

## 导入关系

```text
上游: @lobehub/icons 同步脚本生成结果
下游: builtinIconRegistry.ts, providerIconBuiltinSelection.ts
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `LobehubManifestGroup` | 图标分组：model / provider / application |
| `LobehubManifestStaticVariant` | LobeHub 静态变体类型 |
| `LobehubManifestVariant` | 静态变体加 `combine` |
| `LobehubManifestFormat` | 资源格式：svg / png / webp / avatar |
| `LobehubManifestVariantEntry` | 单个变体的支持状态和 URL |
| `LobehubManifestEntry` | 单个图标清单条目 |
| `LOBEHUB_ICON_MANIFEST` | 生成的完整图标清单数组 |

## 核心逻辑

不包含运行时算法。文件顶部明确标记为 generated file；核心内容是大量静态 manifest 数据。

## 数据流

```text
npm run sync:lobehub-icons
  → scripts/sync-lobehub-icons.mjs
  → src/utils/icons/lobehubIconManifest.ts
  → builtinIconRegistry.ts
  → provider icon picker / cache / fallback
```

## 与其他模块的交互

- `builtinIconRegistry.ts` 消费 manifest 构建 `BuiltinIconDefinition`。
- `providerIconBuiltinSelection.ts` 使用 manifest metadata 判断可用变体和资源。

## 配置项

无。数据由同步脚本和当前依赖版本决定。

## 注意事项

- 不要手工编辑此文件；更新时运行 `npm run sync:lobehub-icons`。
- 变更该文件会影响 provider icon 搜索、展示和缓存行为，通常需要跑 icon registry 相关测试。
