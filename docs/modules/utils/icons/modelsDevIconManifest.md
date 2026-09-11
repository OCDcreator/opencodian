# models.dev Icon Manifest

> **源码**: `src/utils/icons/modelsDevIconManifest.ts`
> **状态**: [REVIEW]

## 概述

`modelsDevIconManifest.ts` 是由 `npm run sync:modelsdev-icons` 生成的 models.dev provider 词汇表。它只保存 provider id 与其展示名称；图标本体在运行时按 `MODELS_DEV_LOGO_BASE_URL/<id>.svg` 直接引用，不做打包。

它的作用是让图标解析与碰撞匹配在没有网络的情况下也能确定"models.dev 认识哪些 provider"。

## 导入关系

```text
上游: https://models.dev/api.json（同步脚本抓取 provider keys）
下游: builtinIconRegistry.ts
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `ModelsDevProviderIcon` | 单个 provider 条目：`id` 与 `name` |
| `MODELS_DEV_PROVIDER_ICONS` | 生成的 provider 列表（按 id 升序） |

## 核心逻辑

不包含运行时算法，只保存静态数据。图标 URL 的拼装规则位于 `builtinIconRegistry.getModelsDevLogoUrl()`。

## 数据流

```text
npm run sync:modelsdev-icons
  → scripts/sync-modelsdev-icons.mjs
  → https://models.dev/api.json
  → src/utils/icons/modelsDevIconManifest.ts
  → builtinIconRegistry.ts（modelsdev library 定义）
  → provider icon 解析 / 选择器 / 缓存
```

## 与其他模块的交互

- `builtinIconRegistry.ts` 用它构建 `modelsdev` library 的 `BuiltinIconDefinition`，并为碰撞匹配提供 identity token。
- `providerIconBuiltinSelection.ts` 与 `providerIconAssetCache.ts` 通过 `getModelsDevLogoUrl()` 取得远程资源地址。

## 配置项

无。数据由同步脚本和 models.dev 当前目录决定。

## 注意事项

- 不要手工编辑此文件；更新时运行 `npm run sync:modelsdev-icons`。
- models.dev 只提供 provider id 与 logo，不提供模型图标，也不在 `api.json` 里暴露图标字段。
- 该来源默认只参与**精确 id** 匹配；其 id 较长且含通用词，若参与模糊搜索会误命中 `provider`、`gateway` 之类的普通单词。
