# ContextFileCatalogService

> **源码**: `src/features/chat/services/ContextFileCatalogService.ts`
> **状态**: [REVIEW]

## 概述

`ContextFileCatalogService` 负责 composer “添加文件上下文”入口使用的 Vault 文件目录。它把可选文件扫描、惰性缓存、扩展名桶统计，以及 vault `create/delete/rename` 增量更新从 `OpenCodianView` 中移出，让视图只负责调用选择器和把选中的文件转成 `PromptContextItem`。

## 导入关系

上游: `obsidian`（App、TFile、TAbstractFile）、`shared/obsidianContext`
下游: `OpenCodianView`、`ContextFilePickerModal`（使用导出的 catalog 类型）

## 核心类型 / 接口

```typescript
interface ContextFileEntry {
  file: TFile;
  lowerPath: string;
  lowerBasename: string;
  lowerExtension: string;
  extension: string;
}

interface ContextFileExtensionBucket {
  value: string;
  count: number;
}

interface ContextFileCatalog {
  entries: ContextFileEntry[];
  extensions: ContextFileExtensionBucket[];
}

class ContextFileCatalogService {
  getCatalog(): Promise<ContextFileCatalog>
  invalidate(): void
  handleCreate(file: TAbstractFile): void
  handleDelete(file: TAbstractFile): void
  handleRename(file: TAbstractFile, oldPath: string): void
}
```

## 核心逻辑

### 惰性构建与缓存

`getCatalog()` 首次调用时遍历 `app.vault.getFiles()`，过滤隐藏路径和无扩展名路径，生成 `ContextFileEntry[]` 与扩展名计数桶；后续调用复用缓存。同一时间已有构建任务时复用 `catalogBuildPromise`，避免重复扫描。

### 扫描批次

构建目录时每 `400` 个文件让出一次事件循环，避免大 Vault 文件扫描长时间阻塞 UI。

### 增量更新

- `handleCreate()`：缓存存在时尝试 upsert 新文件；非文件事件直接使缓存失效
- `handleDelete()`：缓存存在时删除目标路径；非文件事件直接使缓存失效
- `handleRename()`：缓存存在时删除旧路径并 upsert 新文件；非文件事件直接使缓存失效

如果新增或重命名后的路径不再符合上下文文件规则，会只重算扩展名桶，不保留该条目。

## 与其他模块的交互

- **OpenCodianView**: 持有一个 service 实例；文件选择器打开时传入 `getCatalog()`；vault 事件直接转发到 `handleCreate/Delete/Rename`
- **ContextFilePickerModal**: 只消费 `ContextFileCatalog` 数据，不再知道目录如何扫描或缓存
- **shared/obsidianContext**: `isEligibleContextFilePath()` 负责隐藏路径 / 无扩展名过滤，`getContextPathExtension()` 负责扩展名规范化

## 注意事项

- 排序顺序保持为扩展名 → basename → path，确保文件选择器结果稳定
- 只有缓存已存在时才增量更新；尚未打开过文件选择器时，vault 事件不会触发提前扫描
- 非 `TFile` vault 事件必须 invalidate，避免文件夹变更导致缓存结构陈旧
