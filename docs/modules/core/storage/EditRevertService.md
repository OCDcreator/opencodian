# EditRevertService

> **源码**: `src/core/storage/EditRevertService.ts`
> **状态**: [REVIEW]

## 概述

`EditRevertService` 是 R-B3 编辑回退（单文件 / 整轮）的编排 owner：在插件侧为每一轮对话建立**后端无关**的文件快照，并提供"回退单个文件 / 一键回退整轮 / 恢复回退"的执行入口。它不依赖任何后端的 revert 能力（与 OpenCode 的会话级 `revertSession` 语义独立、可并存），对 Claude / Codex / Pi 后端行为完全一致。

关键设计：

- **快照窗口（round）**：`beginTurnCapture()` 开启一轮捕获，`endTurnCapture()` 关闭；回合关闭后仍有 10 分钟 post-turn grace 窗口，窗口内的 vault 写入仍归属该 round。重启后从磁盘恢复的 round 一律视为已关闭（`acceptsWritesUntil` 被钳制到当前时间）。
- **三层 pre-image 来源**：回合开始的预算化预快照（候选来自消息文本 / 上下文路径 / 上一轮条目）、写工具声明时（`tool_use` chunk）的即时捕获、以及"冻结的空闲内容缓存"回退。vault 事件只作为"哪些文件变了"的权威记录，**绝不**充当 pre-image 来源（Obsidian 的 modify 事件是事后通知）。
- **预算**：回合开始的候选预快照有 200ms 墙钟预算（`EDIT_REVERT_SNAPSHOT_BUDGET_MS`），超时即置 `degraded: true` 并停止候选捕获，退化为"仅快照工具声明的文件"。侧栏会如实展示降级提示。
- **Fail-closed 诚实**：超限（>2MiB）或无 pre-image 的文件仍会列出，但明确标注"未纳入回退"，且 `revertible: false`；回退请求会被拒绝并返回原因。
- **写回唯一出口**：所有破坏性写操作都委托给 `EditRevertVaultWriteback`（vault.process / vault.create / vault.trash），自身绝不直接写文件系统。
- **Fail-soft**：快照 / 通知 / 持久化的失败只记 warn 日志，绝不阻塞发送主链路（send pipeline 以 fire-and-forget 方式调用）。
- **插件发起批量捕获（R-B5）**：`beginBatchCapture` 不走 200ms 回合预算——批量是用户发起、清单在预览阶段已知，对全部受影响文件强制预捕获；超限文件照旧进入 `standbyOversize` 如实标注不可回退。`notePluginMove` 存在的原因：vault `rename` 事件不在事件漏斗监听范围内（Obsidian 移动只发 `rename`），插件移动必须显式登记；`endBatchCapture` 关闭后**无宽限窗**（批量写入全部显式登记），因此一键回退即时可用。`endBatchCapture` **只关闭 `backend: 'plugin'` 轮次**：若轮次开启后有真实 agent turn 启动（最新轮次变为 turn 轮），拒绝关闭——绝不提前暴露回合中的回退、也不破坏 turn 的工具声明 pre-image 捕获。`beginBatchCapture` 内部失败一律解析为 `false`，批量执行方必须拒绝执行（fail-closed）。

## 导入关系

```text
上游: obsidian(App/EventRef/normalizePath), src/core/storage/EditRevertStore.ts, src/core/storage/EditRevertVaultWriteback.ts, src/core/types/editRevert.ts, src/shared/editRevertPlan.ts, src/shared/logger
下游: src/main.ts（构造与生命周期）, src/features/chat/ChatPluginPort.ts（以 EditRevertServicePort 消费）
```

## 对外 API

构造 host 契约 `EditRevertServiceHost`：`app`、`isEnabled()`（读 `editRevertEnabled`）、`getSnapshotLimitBytes()`（读 `editRevertSnapshotLimitMb`）、可选 `now()`（测试注入时钟）。

```typescript
class EditRevertService implements EditRevertServicePort {
  initialize(): Promise<void>;                       // 建目录 + 恢复持久化 rounds + 注册 vault 监听
  dispose(): void;
  getSidebarModel(conversationId): EditRevertSidebarModel;
  beginTurnCapture(info: EditRevertTurnBeginInfo): void;
  endTurnCapture(conversationId): void;
  noteWriteToolUse(info: EditRevertWriteToolInfo): void;
  revertFile(conversationId, path): Promise<EditRevertActionResult>;
  revertAll(conversationId): Promise<EditRevertActionResult>;
  restoreFile(conversationId, path): Promise<EditRevertActionResult>;
  onEntriesChanged(listener): () => void;            // 侧栏刷新订阅
  // R-B5 插件发起批量捕获（详见 docs/architecture/owners/app-batch-organize.md）
  beginBatchCapture(conversationId, paths): Promise<boolean>; // 强制预捕获全部路径，无预算；失败 → false
  notePluginMove(conversationId, from, to): Promise<void>;    // 'moved' 条目（movedTo），回退 = renameFile 改回
  notePluginWrite(conversationId, path): Promise<void>;       // 显式记录写入条目（pre-image 来自强制捕获）
  endBatchCapture(conversationId): Promise<void>;             // 立即关闭（无 grace），回退即时可用
  // 测试缝：handleVaultModify/Create/Delete、flush()、getRoundMeta()、listBlobHashes()
}
```

## 核心逻辑

### vault 事件漏斗

监听 vault 的 `modify` / `create` / `delete` 事件（仅 Markdown 文本文件；`extension === 'md'`），经 `normalizeVaultPath()`（相对化 + 拒绝 `..` 与 `.opencodian/` 前缀）后归属到当前开放的 round。回退/恢复自身触发的写由 writeback 的 self-write guard 吞掉，不会被记录为新的 agent 编辑。无开放 round 时的 modify 事件会喂养"空闲内容缓存"（64 文件 / 8MiB LRU），供下一轮冻结使用。

### 条目状态机

- `status`: `modified` / `created` / `deleted`。**`created` 是粘性的**：回合内新建的文件再次被写入不降级为 `modified`（它没有回合前 pre-image，回退语义是进回收站而非恢复内容）；只有 `deleted` 能覆盖 `created`。
- `state`: `active` / `reverted`。回退后 entry 保留 `restoreHash`（回退前的当前内容），供"恢复回退"。
- `preImageStatus`: `available` / `oversize` / `unavailable`，直接决定侧栏的"未纳入回退"标注。

### 保留与淘汰

`endTurnCapture` 与持久化定时器会触发 `enforceRetention()`：按 `planRoundEvictions()`（shared 纯函数）淘汰最旧 round（轮数上限 30、每会话上限 10、字节上限 `editRevertSnapshotLimitMb` 与单文件快照上限取大者），随后清扫不再被任何 round 引用的 blob。

## 与其他模块的交互

- `main.ts`：启动时构造并 `initialize()`，`onunload` 时 `dispose()`。
- `ChatRuntimeComposition` / `SendPipelineRuntime`：发送管线以可选 hook（`onTurnSnapshotBegin/End`、`onWriteToolUse`）调用本服务，全部 fire-and-forget。
- `OpenCodianView` + `ModifiedFilesSidebarCoordinator`：侧栏通过 `getSidebarModel()` 取视图模型，通过 `onEntriesChanged()` 订阅刷新。
- `StreamChunkRouter`：把 `tool_use` chunk 转发给 `noteWriteToolUse()`，chunk 本身继续按原流程渲染。

## 配置项

- `editRevertEnabled`（默认 true）：总开关；关闭时不捕获、侧栏无回退动作。
- `editRevertSnapshotLimitMb`（默认 50，钳制 10–500）：`.opencodian/checkpoints/` 的字节保留上限。

## 注意事项

- 回合未关闭（turn 进行中或 grace 未过期）时回退请求会失败（`round-open`）；UI 在 `roundOpen` 时禁用回退按钮。
- round id 为 `round-<ts>-<seq>`，`seq` 是实例内单调计数；持久化跨重启的唯一性由时间戳保证。
- 修改本模块前先看 `src/shared/editRevertPlan.ts`（纯规划层）与 `EditRevertVaultWriteback`（唯一写缝）的职责边界，避免把 IO 或写回逻辑搬回本模块。

## R-C2 扩展：registerPluginCreatedAsset

2026-09-18 新增公开方法 `registerPluginCreatedAsset(conversationId, assetPath, notePaths?)`：把插件生成的二进制资产（W-asset 之后调用）登记为当前轮次（或新建 `backend: 'plugin'` 轮次）中 `status: 'created'`、`source: 'plugin'`、`binaryAsset: true` 的条目，并对 `notePaths`（即将写入引用的笔记）做免预算 markdown 预像捕获，使资产与引用可成对回退。二进制条目零快照存储；回退=trash，restore 依 `binaryAsset` 标志在构造上不可用。启用关闭时为 no-op（fail-soft）。

D2 修复（同日）：无已开轮次时新建的 `plugin` 轮次**保持开放**（`closedAt: null`，grace 窗口仅作流程中断时的有界兜底），R-C2 流程在 W-ref 终态（成功或失败）后走 R-B5 的 record-then-close 约定——`notePluginWrite` 显式登记引用写入（不依赖 autosave 事件时序）、`endBatchCapture` 立即关闭，一键回退即时可用，不再等待 10 分钟 grace。进行中的 turn 轮次照旧只随自身生命周期关闭。
