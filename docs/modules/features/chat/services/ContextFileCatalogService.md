# ContextFileCatalogService

> **源码**: `src/features/chat/services/ContextFileCatalogService.ts`
> **状态**: [REVIEW]

## 概述

`ContextFileCatalogService` 负责 composer “添加文件上下文”入口使用的 Vault 文件目录。它现在把 build 阶段的批量扫描/异步让步下沉到 `ContextFileCatalogBuildRunner`，把 catalog 条目规范化、排序与增量 mutation 下沉到 `ContextFileCatalogIndex`，自身只保留惰性缓存、build promise 协调与非文件事件失效判断，让视图继续只负责调用选择器和把选中的文件转成 `PromptContextItem`。

## 导入关系

上游: `obsidian`（App、TFile、TAbstractFile）、`ContextFileCatalogBuildRunner`、`ContextFileCatalogIndex`
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

`getCatalog()` 首次调用时读取 `app.vault.getFiles()`，并委托 `ContextFileCatalogBuildRunner` 分批构建 `ContextFileCatalogIndex`；扫描结束后复用同一个 index 作为缓存。后续调用直接返回缓存；同一时间已有构建任务时复用 `catalogBuildPromise`，避免重复扫描。

### 扫描批次

批次大小与事件循环让步策略已移到 `ContextFileCatalogBuildRunner`。service 不再直接持有 `400` 条/批与 `setTimeout(0)` 的执行细节。

### 增量更新

- `handleCreate()`：缓存存在时把新增文件转交给 `ContextFileCatalogIndex.upsertFile()`；非文件事件直接使缓存失效
- `handleDelete()`：缓存存在时把目标路径转交给 `ContextFileCatalogIndex.removePath()`；非文件事件直接使缓存失效
- `handleRename()`：缓存存在时把 rename 语义统一转交给 `ContextFileCatalogIndex.renameFile()`；非文件事件直接使缓存失效

如果新增或重命名后的路径不再符合上下文文件规则，index 会直接把对应条目移出 catalog，并重算扩展名桶。

## 与其他模块的交互

- **OpenCodianView**: 持有一个 service 实例；文件选择器打开时传入 `getCatalog()`；vault 事件直接转发到 `handleCreate/Delete/Rename`
- **ContextFilePickerModal**: 只消费 `ContextFileCatalog` 数据，不再知道目录如何扫描或缓存
- **ContextFileCatalogBuildRunner**: 负责 build 阶段的 batch scan 与 async yield
- **ContextFileCatalogIndex**: 持有 catalog 条目规范化、排序、bucket 重算与增量 mutation
- **shared/obsidianContext**: `isEligibleContextFilePath()` 负责隐藏路径 / 无扩展名过滤，`getContextPathExtension()` 负责扩展名规范化

## 注意事项

- 排序顺序保持为扩展名 → basename → path，确保文件选择器结果稳定
- 只有缓存已存在时才增量更新；尚未打开过文件选择器时，vault 事件不会触发提前扫描
- 非 `TFile` vault 事件必须 invalidate，避免文件夹变更导致缓存结构陈旧
- service 自身不再持有 batch scan/yield 或 entry/bucket 维护细节；后续如果继续拆分 context catalog，应优先沿 `ContextFileCatalogBuildRunner` / `ContextFileCatalogIndex` 与 cache orchestration 的边界推进
