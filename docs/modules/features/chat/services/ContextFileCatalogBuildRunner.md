# ContextFileCatalogBuildRunner

> **源码**: `src/features/chat/services/ContextFileCatalogBuildRunner.ts`
> **状态**: [REVIEW]

## 概述

`ContextFileCatalogBuildRunner` 是 `ContextFileCatalogService` 的批量扫描执行器。它负责把 `vault.getFiles()` 返回的 `TFile[]` 分批追加到 `ContextFileCatalogIndex`，在批次之间异步让出事件循环，并在扫描结束后统一 finalize index，让 service 进一步收窄为 cache/build promise 协调层。

## 导入关系

上游: `obsidian`（`TFile`）、`ContextFileCatalogIndex`
下游: `ContextFileCatalogService`

## 公开接口

```typescript
interface ContextFileCatalogBuildRunnerOptions {
  batchSize?: number;
  yieldControl?: () => Promise<void>;
}

class ContextFileCatalogBuildRunner {
  buildIndex(files: readonly TFile[]): Promise<ContextFileCatalogIndex>
}
```

## 核心逻辑

### 批量扫描

- `buildIndex()` 逐批读取传入的文件数组，并把每个 `TFile` 交给 `ContextFileCatalogIndex.appendBuildFile()`
- 默认批次大小是 `400`，保持原先 catalog 构建的吞吐与 UI 友好性

### 异步让步

- 当剩余文件尚未扫描完成时，runner 会在批次边界调用 `yieldControl()`
- 默认实现继续使用 `window.setTimeout(resolve, 0)`，因此行为与原先 service 内联的 yield 逻辑一致

### 构建收尾

- 所有批次完成后统一调用 `finalizeBuild()`，把排序与扩展名桶重算留在 `ContextFileCatalogIndex`
- runner 不缓存 catalog，也不处理 vault 事件；这些职责仍留在 service

## 与其他模块的交互

- **ContextFileCatalogService**：提供文件数组并等待 build 完成，再接管缓存
- **ContextFileCatalogIndex**：负责条目资格过滤、排序和 bucket 重算

## 注意事项

- `yieldControl` 主要是为了测试与未来调度策略替换；正常运行时应继续保持零延迟事件循环让步
- runner 只处理 build 阶段，不参与 create/delete/rename 的增量 mutation
