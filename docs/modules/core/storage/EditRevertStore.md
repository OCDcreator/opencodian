# EditRevertStore

> **源码**: `src/core/storage/EditRevertStore.ts`
> **状态**: [REVIEW]

## 概述

`EditRevertStore` 负责 R-B3 编辑回退检查点在插件数据目录内的全部磁盘 IO。目录布局为 `.opencodian/checkpoints/`（`blobs/` 内容寻址 blob + `rounds/<会话slug>/` 每 round 一个 JSON）。所有读写都走 Obsidian 的 vault data adapter（`app.vault.adapter`），绝不直接写文件系统。保留的**规划**是 `src/shared/editRevertPlan.ts` 的纯函数；本类只执行 `EditRevertService` 做出的淘汰决定。

## 导入关系

```text
上游: obsidian(App/normalizePath), node:crypto(sha256), src/shared/logger, src/core/types
下游: src/core/storage/EditRevertService.ts, src/core/storage/EditRevertVaultWriteback.ts
```

## 对外 API

```typescript
class EditRevertStore {
  constructor(app: App);
  prepare(): Promise<void>;                                       // 建 blobs/ 与 rounds/ 目录
  saveRound(meta: EditRevertRoundMeta): Promise<void>;            // 单行 JSON
  removeRound(meta): Promise<void>;
  roundFilePath(meta): string;
  storeBlob(content: string): Promise<StoredImage>;               // sha256 内容寻址；已存在即跳过（去重）
  hashContent(content): StoredImage;                              // 同一 sha256/byte 算法，无 adapter 写入（R-F3 比较）
  readBlob(hash): Promise<string | null>;
  getBlobBytes(hash): number;                                     // 内存缓存
  statBlob(hash, fallback): Promise<number>;
  forgetBlobBytes(hash): void;
  listBlobHashes(): Promise<string[]>;                            // 64 位 hex 过滤
  removeBlob(hash): Promise<void>;
  loadRoundMetas(now): Promise<EditRevertRoundMeta[]>;            // 跳过损坏文件；钳制 acceptsWritesUntil
}
```

路径常量：`CHECKPOINTS_DIR`、`CHECKPOINT_BLOBS_DIR`、`CHECKPOINT_ROUNDS_DIR`。

## 核心逻辑

### 内容寻址去重

`storeBlob()` 先算 sha256，再按 hash 命名写文件；同一份内容无论被多少个 round / 条目引用，磁盘上只有一份。`hashContent()` 复用完全相同的 sha256/UTF-8 byte 算法但不写 adapter，供 R-F3 只读 current-vs-post-baseline 比较，避免创建第二套 hash 语义。`blobBytesByHash` 内存缓存避免重复 stat。

### 会话目录命名

`roundDirName()` 用会话 id 的清洗 slug（24 字符）+ sha256 前 8 位十六进制，避免文件系统非法字符与碰撞。

### 重启语义

`loadRoundMetas()` 恢复持久化 round 时把 `acceptsWritesUntil` 钳制到 `min(saved, now)`：重启即结束任何进行中的捕获窗口（fail-closed），恢复后的 round 立即可回退。损坏的 JSON 会被跳过并记 warn。

## 注意事项

- 本类不做淘汰决策；新增保留策略时改 `shared.editRevertPlan.planRoundEvictions()`，不要在这里加规则。
- blob 清扫（删除无引用 blob）由 `EditRevertService.enforceRetention()` 编排，本类只提供 `listBlobHashes/removeBlob`。
