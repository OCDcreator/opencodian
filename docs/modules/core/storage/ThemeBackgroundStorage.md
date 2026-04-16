# ThemeBackgroundStorage

> **源码**: `src/core/storage/ThemeBackgroundStorage.ts`
> **状态**: [REVIEW]

## 概述

`ThemeBackgroundStorage` 是 `StorageService` 内部使用的主题背景资产 owner。它单独负责：

- `theme-backgrounds/` 目录初始化
- 背景图大小校验
- MIME / 扩展名检测
- 二进制写入、删除、回读为 data URL

这样 `StorageService` 保留会话、设置与运行时状态的主协调职责，不再直接铺开背景图资产的二进制细节。

## 导入关系

```text
上游: obsidian normalizePath/App, path, src/core/storage/StorageService.ts
下游: src/core/storage/StorageService.ts
```

## 对外 API

```typescript
interface StoredThemeBackgroundAsset {
  path: string;
  mimeType: string;
  displayName: string;
}

class ThemeBackgroundStorage {
  initialize(): Promise<void>;
  saveAsset(data: ArrayBuffer, sourceName: string, hintedMimeType?: string): Promise<StoredThemeBackgroundAsset>;
  remove(storedPath: string | null | undefined): Promise<void>;
  readDataUrl(storedPath: string, hintedMimeType?: string): Promise<string | null>;
}
```

## 核心逻辑

### 目录与写入

- 固定写入 `.opencodian/theme-backgrounds/`
- `saveAsset()` 先校验 64 MB 上限，再判断 MIME 并映射扩展名
- 文件名仍保持 `theme-bg-{timestamp}-{random}.{ext}` 形式
- adapter 缺少 `writeBinary()` 时继续抛出原有错误

### MIME 检测

检测顺序保持不变：

1. 优先接受合法 `hintedMimeType`
2. 再看 SVG 文本/XML 头
3. 再看 PNG/JPEG/GIF/WEBP 二进制签名
4. 最后按扩展名兜底

只支持：

- SVG
- PNG
- JPEG
- WEBP
- GIF

### 删除与回读

- `remove()` 仍对缺失文件静默忽略
- `readDataUrl()` 仍先检查文件是否存在
- adapter 缺少 `readBinary()` 时仍返回 `null`
- 成功读取后继续返回 `data:${mimeType};base64,...`

## 与 StorageService 的边界

- `StorageService.initialize()` 只调用 `ThemeBackgroundStorage.initialize()`
- `StorageService.saveThemeBackgroundAsset()` / `removeThemeBackground()` / `readThemeBackgroundDataUrl()` 只做兼容转发
- 上层 `src/main.ts` 的调用面与返回结构保持不变
