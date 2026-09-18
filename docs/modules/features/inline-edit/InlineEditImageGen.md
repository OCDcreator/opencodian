# InlineEditImageGen

> **源码**: `src/features/inline-edit/InlineEditImageGen.ts`
> **状态**: [REVIEW]

## 概述

`InlineEditImageGen` 是 R-C2 行内编辑入口的编排层，同时承载两个入口共用的**两步写契约**（generate → W-asset → R-B3 登记 → 嵌入文本）。引用写入（W-ref）不在这里：行内入口走既有 preview → `executeInlineEditAccept` 的单次 `editor.replaceRange` 接受流，脏检查与单步撤销免费继承。

依赖全部注入（`InlineEditImageGenDeps`，组合根 `main.ts` 实现），本模块不 import `core.storage`，测试无 Obsidian。

## 两步写失败语义矩阵（设计 §4.2）

| 分支 | 文档 | 磁盘 | 用户看到 |
|---|---|---|---|
| 生成失败（timeout/quota/http/network/size-limit） | 零改动 | 零写入 | 失败提示含 `kind` 与原因 |
| W-asset 保存失败 | 零改动（W-ref 从未尝试） | 零写入（或写入抛错的残留由 vault 语义保证） | 失败提示 |
| 保存后 signal 已 abort | 零改动 | 资产立即 `trashAsset`（不留孤儿） | 取消提示 |
| 成功 | preview 出现，接受才落引用 | 资产已落盘 + 登记 | 预览 diff |
| 预览被拒绝 | 零改动 | 按 `imageGenerationAssetCleanup`（默认 trash）| Notice 含实际路径 |
| W-ref 失败（脏检查/replaceRange 抛错） | 零改动 | 资产**保留**；R-B3 资产轮次立即关闭（D2） | Notice 含实际路径（见 `InlineEditAccept`） |

## 对外 API

```typescript
interface InlineEditImageGenDeps {
  models; maxWidth; cleanup;
  generate(model, prompt, signal?); saveAsset(bytes, mime, baseName);
  trashAsset(path); registerAsset(assetPath, notePath);
  noteReferenceWrite?(notePath); endAssetCapture?();
  notify(message);
}

runInlineEditImageGeneration(deps, { prompt, form, notePath, signal? }): Promise<ImageGenInsertPlan>;
cleanupRejectedImageAsset(deps, path): Promise<void>;
```

## 关联模块

- `InlineEditController.ts`：chip 状态机（off→line→inline）、生成中 Esc 取消、reject/dispose 的孤儿清理。
- `InlineEditHost.ts` / `InlineEditPluginHost.ts`：`getImageGeneration?()` 可选 host 成员；无配置模型时返回 `null`（chip 隐藏）。
- `src/core/agents/imagegen/ImageGenerationService.ts`：生成服务与嵌入文本构造。
- `src/main.ts`：deps 的组合实现（服务、资产存储、回退登记、conversation id 解析）。

## D2 record-then-close（2026-09-18）

`cleanupRejectedImageAsset`（预览拒绝 / 编辑销毁 / 生成中途编辑失活的唯一终态处理）现在首先调用可选的 `endAssetCapture()`——引用写永远不会发生，R-B3 插件资产轮次随之立即关闭，一键回退不再等待 post-turn grace。接受路径的先登记后关闭由 `InlineEditAccept` 的新可选 deps 承担（`noteReferenceWrite` 在 `replaceRange` 成功后、`endAssetCapture` 关闭前调用，顺序由组合根接到 `notePluginWrite` → `endBatchCapture` 的服务队列保证）。
