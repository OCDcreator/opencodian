# ContextFileCatalogIndex

> **源码**: `src/features/chat/services/ContextFileCatalogIndex.ts`
> **状态**: [REVIEW]

## 概述

`ContextFileCatalogIndex` 是 `ContextFileCatalogService` 内部使用的可变 catalog 索引。它集中处理 context-file 条目的资格过滤、排序、扩展名桶重算，以及 create/delete/rename 增量更新，让 service 只保留 Vault 访问、惰性缓存与 build promise 协调。

## 导入关系

上游: `obsidian`（`TFile`）、`shared/obsidianContext`
下游: `ContextFileCatalogService`

## 公开接口

```typescript
class ContextFileCatalogIndex {
  getCatalog(): ContextFileCatalog
  appendBuildFile(file: TFile): void
  finalizeBuild(): void
  upsertFile(file: TFile): void
  removePath(targetPath: string): void
  renameFile(file: TFile, oldPath: string): void
}
```

## 核心逻辑

### build 阶段累积

- `appendBuildFile()` 只负责把符合条件的 `TFile` 追加到 build 中的 entries 列表
- `finalizeBuild()` 在批量扫描结束后统一排序并重算扩展名桶，避免 `ContextFileCatalogService` 再持有条目规范化细节

### 增量目录维护

- `upsertFile()` 统一处理缓存存在时的 create / overwrite 场景
- `removePath()` 只在目标路径命中时重算 bucket，避免无效删除触发额外写回
- `renameFile()` 会先移除旧路径（以及必要时的新路径冲突项），再按新的文件资格决定是否重新入表

### catalog 规范化

- 条目过滤继续复用 `isEligibleContextFilePath()` 与 `getContextPathExtension()`
- 排序顺序保持为 `extension -> basename -> path`
- 扩展名桶继续来自当前 entries 的实时计数，因此 service 不再单独维护 extension map

## 与其他模块的交互

- **ContextFileCatalogService**：负责调用 build append/finalize，并把 vault 事件直接转成 index mutation
- **shared/obsidianContext**：提供隐藏路径与扩展名资格规则

## 注意事项

- index 只维护内存中的 catalog 结构，不接管 `app.vault.getFiles()` 扫描或异步让步时机
- `getCatalog()` 返回的是同一份 live catalog 对象，因此上层缓存语义保持不变
