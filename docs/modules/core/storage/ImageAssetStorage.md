# ImageAssetStorage

> **源码**: `src/core/storage/ImageAssetStorage.ts`
> **状态**: [REVIEW]

## 概述

`ImageAssetStorage` 是 R-C2 的二进制资产落盘 owner（`core.storage`），实现设计定义的写步骤 **W-asset**：把生成的图片写入用户内容区（附件目录），返回 vault 相对路径。这是插件**第一个写入用户内容区的二进制写路径**——既有二进制写（`ThemeBackgroundStorage`、provider-icon cache、插件更新资产）全部限于插件私有目录。

## 对外 API

```typescript
interface ImageAssetVault {
  getAvailablePathForAttachments(fileName: string): Promise<string>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  trash(path: string): Promise<boolean>;
}

class ImageAssetStorage {
  save(data, mimeType, baseName): Promise<{ path: string }>;  // 绝不覆盖
  trash(path): Promise<boolean>;
}

// 纯函数
sanitizeImageAssetBaseName(raw): string;
isSafeVaultRelativeAssetPath(path): boolean;
```

## 不变量

- **绝不覆盖**：放置交给 Obsidian 原生 `getAvailablePathForAttachments`（遵守 `attachmentFolderPath` 设置 + 原生冲突编号）；对返回路径再 `exists` 复查，若仍被占用则按 `-2/-3…` 后缀探测（上限 100 次），仍无空位则抛错。
- **越界 fail-closed**（设计 §7）：解析抛错、或解析结果为绝对路径/含 `..` 段（用户把附件目录配到 vault 外）→ 在写入任何字节前抛错。调用方必须把 throw 当作"W-asset 失败 = 文档零改动"。
- **清理走 vault API**：`trash` 经 `vault.trash`（与 `EditRevertVaultWriteback` 一致），失败如实返回 `false`。

## 关联模块

- `src/core/agents/imagegen/ImageGenerationService.ts`：上游数据源（生成结果）。
- `src/main.ts`：组合根用 `app.vault` 组装 `ImageAssetVault`（`getAvailablePathForAttachments` 运行时已验证但当前 obsidian.d.ts 未收型，组合处用守卫 cast）。
- `src/features/inline-edit/InlineEditImageGen.ts`、`src/features/chat/services/ImageGenerationChatController.ts`：两个入口通过注入 port 消费，不直接 import 本模块。
