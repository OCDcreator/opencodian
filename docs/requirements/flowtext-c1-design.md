# R-C1 整库语义检索（整库感知模式）— 实施前设计

> 需求基准：`docs/requirements/flowtext-parity.md` §5 R-C1（约 :544-578）
> 共享约束：`docs/requirements/flowtext-parity-impl-plan.md` §1；需求文档 §6 跨批次硬约束
> 已裁决（§10 Q3，不再重议）：**先做词面检索**，embedding 仅作为后续可选增强层；不引入向量库。
> 本文档是实施前设计，实现者按此落地；与需求冲突处以需求文档为准并回填本文。

---

## 1. 目标与范围

**目标**：提供显式开关的整库检索增强（`vaultRetrievalEnabled`，默认 `false`）。开启后，聊天发送管线在请求发出前用**词面打分**（复用 `memoryRecall` 的打分思路）对 vault 笔记索引做匹配，把 ≤ K 篇最相关笔记片段作为参考资料注入本次请求；注入内容在 UI 中始终可见、可逐条取消。

**范围内**：

1. vault 笔记的本地词面索引（后台构建、增量更新、排除规则、插件数据目录存储）。
2. 检索 → 选段 → 截断 → 注入的纯函数核心（可单测）。
3. 发送管线接入点与注入可见性（composer chips + 用户消息渲染复用既有上下文 UI）。
4. §7 四个设置项：`vaultRetrievalEnabled` / `vaultRetrievalTopK` / `vaultRetrievalMaxCharsPerNote` / `vaultRetrievalExcludedPaths`。
5. 关闭态逐字节回归（§8.2 R-C1 契约测试）。

**明确不做（§11 适用）**：

1. 不做 embedding / 向量库 / 任何网络召回（§10 Q3 已裁决；§11.4 禁止引入与既有架构冲突的依赖）。
2. 不做聊天之外的注入面：行内编辑、标题生成、后台任务**不**消费整库检索（如需，另行设计）。
3. 不做"跨轮次继承"：每次发送独立检索，注入不进入历史消息（遵守 `docs/requirements/obsidian-linkage.md:13` 的"显式、单次发送态"原则——本设计把它从"永不注入"收窄为"仅当显式开启时注入且始终可见"，默认行为不变）。
4. 不重命名既有 `memorySemanticRecallEnabled`（该开关属于记忆库功能，与整库检索无关；名称误导问题记录在开放问题，不在本条处理）。
5. 不做 PDF/Canvas 的索引（R-C4 二期复用本索引基础设施，本条不预留任何 PDF 专用逻辑）。

---

## 2. 现状证据（本分支已逐条核实，2026-09-18）

| 需求文档声称 | 本分支实际情况 | 结论 |
|---|---|---|
| `memoryRecall.ts:8-10` 注明 embedding 通道未移植 | 属实：`src/core/memory/memoryRecall.ts:8-10`（"the embedding channel is intentionally not ported — the semantic path is lexical prefilter + optional lite-model ranking with lexical fallback"） | 准确 |
| 选择逻辑为 `rankLexically` / `lexicalCandidates` | 属实：`rankLexically` 在 `:159`，`lexicalCandidates` 在 `:181-189`；`tokenize`（`:74-93`，拉丁词 + CJK 二元组）、`scoreEntry`（`:114-130`，字段加权 name=3/stem=2/desc=1）、`isVerbatimHit`（`:137-147`）均为导出的纯函数 | 准确，且打分原语可直接复用 |
| 记忆库是 `.opencodian/memory/`（`memoryPaths.ts:14`） | 属实（实际行号 `:15`，`MEMORY_STORE_ROOT = '.opencodian/memory'`），且该目录在 vault 内但对 Obsidian 隐藏——不是 vault 笔记 | 准确（行号漂移 1 行） |
| `memorySemanticRecallEnabled`（`settings.ts:3083`）名称误导，生产路径只跑词面匹配 | 属实（实际行号 `:3378`，默认 `false` 在 `:3583`；归一化在 `:3406-3408`）。消费点：`MemoryBackendService.ts:190`（`if (settings.memorySemanticRecallEnabled && ...)` → `selectRecallBodies` 词面选择） | 准确（行号漂移 295 行） |
| `obsidian-linkage.md:13` 显式单次发送态策略 | 属实："上下文采用'显式、单次发送态'策略，不自动注入，不跨轮次继承" | 准确 |
| 上下文注入通道 | 需求未列，本设计补充：聊天发送管线的上下文接缝在 `src/features/chat/runtime/SendPipelineRuntime.ts:262`（`prepareMessageSend` 产出 `preparedSend.contextItems`）与 `:427-435`（`contextItems` 随 `sendStreamMessage` 进入请求）；上下文条目类型 `PromptContextItem`（`src/core/types/chat.ts:66-74`，已支持 `lineRange` + `textSnapshot`）；发送后渲染在 `src/features/chat/runtime/UserMessageContentRenderer.ts:86-87`（`message.contextAttachments`） | 新增证据：注入可以完全复用既有 contextItems 通道，无需新请求形态 |

**既有基础设施的关键事实**：

- `feature.chat-runtime` owner 的允许依赖**已包含 `core.memory`**（`npm run inspect:owner -- feature.chat-runtime` 实测），发送管线引用检索服务无需放宽任何依赖约束。
- `core.memory` 的允许依赖为 `shared, core`（禁 `feature/app`），检索核心保持后端无关是 owner 边界的自然结果。
- vault 写事件监听 precedent：`EditRevertService.ts:290-304`（`vault.on('modify'/'create'/'delete')`），索引增量更新沿用同一事件面。
- 隐藏目录 precedent：`.opencodian/memory`（`memoryPaths.ts:15`）、`.opencodian/theme-backgrounds`（`ThemeBackgroundStorage.ts:7`）、`.opencodian/provider-icons`（`providerIconAssetCache.ts:57`）——Obsidian 文件列表/搜索默认不显示点开头目录，满足验收标准 6。

---

## 3. 技术方案

### 3.1 Owner 归属（inspect:owner 实测结果）

| 新增/修改模块 | Owner | 依据 |
|---|---|---|
| `src/core/memory/vaultRetrievalIndex.ts`（新） | `core.memory` | 词面打分、分块、截断是该 owner 既有职责（"index-only recall assembly with lexical semantic fallback"）的直接延伸；`memoryRecall.ts` 的 `tokenize`/加权重叠思想在此复用 |
| `src/core/memory/VaultIndexService.ts`（新） | `core.memory` | 索引构建/增量/查询的运行时协调，比照 `MemoryBackendService` 在同一 owner 的地位 |
| `src/features/chat/runtime/SendPipelineRuntime.ts`（改） | `feature.chat-runtime` | 发送管线已属该 owner；其允许依赖含 `core.memory`（实测），注入钩子在此接入 |
| `src/core/types/chat.ts`（改，加可选字段） | `core.types` | `PromptContextItem` 增加可选 `origin` 字段 |
| `src/features/settings/*` + `src/core/types/settings.ts` + i18n | `feature.settings-shell` / `core.types` / `shared.i18n` | §7 四件套常规路径 |
| `src/main.ts`（改，组装注入钩子） | `app.composition` | 比照既有记忆运行时组装模式；`main.ts` 只做构造与注入，不含检索逻辑 |

**为什么扩展现有 owner 而不是新增 `core.retrieval`**：检索核心的打分原语（CJK 二元组、停用词、加权重叠、verbatim 命中）已经在 `core.memory` 内存在并被测试覆盖（`tests/unit/core/memory/memoryRecall.test.ts`）；新建 owner 会复制这套领域逻辑或引入一层间接。`core.memory` 的职责文案需在实施时同步扩展一句"vault-wide lexical retrieval index"（属 `architecture-owners.config.json` 的 owner 概况更新，走既有 owner 变更流程，并同步 `docs/architecture/owners/core-memory.md` 与 `docs/modules/core/memory/**`）。

### 3.2 数据结构与接口签名

核心（`src/core/memory/vaultRetrievalIndex.ts`，纯函数，无 I/O）：

```ts
/** 一个索引分块：定位信息 + 词面 token（正文文本不入索引，查询时按行号回读）。 */
export interface VaultIndexChunk {
  /** 起始行（1-based，含）与结束行（含），随笔记内容偏移锚定。 */
  readonly startLine: number;
  readonly endLine: number;
  /** 分块类型：标题节 / 段落，用于截断时保完整语义单元。 */
  readonly kind: 'section' | 'paragraph';
  /** 该分块的词面 token（复用 memoryRecall 的 tokenize：拉丁词 + CJK 二元组）。 */
  readonly tokens: readonly string[];
}

export interface VaultIndexEntry {
  readonly path: string;          // vault 相对路径（POSIX 分隔）
  readonly mtimeMs: number;
  /** 笔记标题（文件名去扩展名），打分时享受 name 权重。 */
  readonly title: string;
  /** 全文内容 hash（sha-1 前 16 位），用于跳过未变更笔记。 */
  readonly contentHash: string;
  readonly chunks: readonly VaultIndexChunk[];
}

/** 排除规则：大小写不敏感的路径匹配，支持 `*` 通配（段内）。 */
export function isExcludedPath(path: string, rules: readonly string[]): boolean;

/** 分块：按标题节切分；节超过 SOFT_CHUNK_CHARS 时按空行段落二分；代码块围栏不可穿越。 */
export function chunkNote(text: string): Array<{ startLine: number; endLine: number; kind: 'section' | 'paragraph' }>;

/** 打分：memoryRecall.scoreEntry 的 vault 版——字段权重 title=3 / 标题行 token=2 / 正文=1，
 *  verbatim 标题命中直接置顶；每个查询 token 只计一次。 */
export function scoreChunk(queryTokens: readonly string[], chunk: VaultIndexChunk): number;

/** 截断到 maxChars，绝不切进未闭合的代码围栏：超限则在最近的完整段落/围栏边界截断，
 *  并返回 truncation 信息供 UI 标注。 */
export function truncateNoteSnippet(text: string, maxChars: number): { text: string; truncated: boolean };

export function selectVaultSnippets(input: {
  query: string;
  entries: readonly VaultIndexEntry[];        // 已按 mtime 过滤的最新态
  topK: number;
  maxCharsPerNote: number;
}): Array<{ path: string; startLine: number; endLine: number; score: number; verbatim: boolean }>;
```

选段门槛（定案）：`score > 0` 的分块按分数排序后，**要求至少命中 2 个不同查询 token，或 verbatim/标题命中**，否则整条丢弃——防止单个常用二元组造成的误召回。TopK 内同笔记最多贡献 1 个分块（一篇笔记注入一次，避免同笔记挤占 K 个名额）。

运行时服务（`src/core/memory/VaultIndexService.ts`，fs 依赖注入，比照 `MemoryBackendService` 模式）：

```ts
export interface VaultIndexFs {
  listMarkdownFiles(): Promise<readonly { path: string; mtimeMs: number }[]>;
  read(path: string): Promise<string | null>;
  writeIndexFile(path: string, data: string): Promise<void>;   // 仅 .opencodian/vault-index/**
  readIndexFile(path: string): Promise<string | null>;
  deleteIndexFile(path: string): Promise<void>;
  onVaultChanged(handler: (path: string, kind: 'modify' | 'create' | 'delete' | 'rename') => void): () => void;
}

export class VaultIndexService {
  constructor(fs: VaultIndexFs, getSettings: () => VaultRetrievalSettingsSlice);
  /** 后台增量构建；分片按笔记落盘，时间预算制，永不阻塞 UI。 */
  async rebuildMissing(maxMsPerTick?: number): Promise<void>;
  /** 查询（同步命中内存缓存；未命中分片懒加载）。 */
  async select(query: string): Promise<readonly SelectedSnippet[]>;
  /** 设置变更（排除规则/开关）后整体失效重建。 */
  invalidateAll(): void;
  dispose(): Promise<void>;
}
```

### 3.3 索引存储布局（插件数据目录，不污染 vault）

```
.opencodian/vault-index/
  manifest.json                 // { version, entries: { [path]: { mtimeMs, contentHash, shard } } }
  shards/<sha1(path)>.json      // 单笔记分片：VaultIndexEntry（仅 token + 行号，不含正文）
```

- 按 `memoryPaths.ts` 既有 hash 规范生成 shard 文件名；`.opencodian/**` 点前缀目录对 Obsidian 文件列表与搜索不可见（验收标准 6）。
- 增量更新 = 该笔记 shard 重写 + manifest 单条更新（防抖 2s 合并连续 modify 事件，比照 `EditRevertService` 的事件面但独立订阅）。
- 索引体积上限保护：单 shard 超过 512KB（异常大笔记）只索引前 N 个分块并记录 `partial: true`；manifest 总量超过 100MB 停止扩容并提示（定案，防失控）。

### 3.4 分块与截断语义（需求要求定案）

- **分块**：一级按 Markdown 标题（`#`~`######`，含 Setext）切 section；单个 section 超过 `SOFT_CHUNK_CHARS = 1500` 字符时，在围栏外的空行处二分为 paragraph 级分块。代码围栏（``` / ~~~）期间不切分。
- **打分**：查询 token 来自复用的 `tokenize`（拉丁小写词 + CJK 二元组，双语停用词表）。字段权重：笔记标题 3 / 命中行若为标题行 2 / 正文 1；每个查询 token 只计一次（与 `scoreEntry` 一致）。排序 tie-break：score → verbatim → mtime 新者优先。
- **截断**：注入片段 = 命中分块向前后各扩 1 个相邻分块（语义完整性），再按 `vaultRetrievalMaxCharsPerNote`（默认 4000）截断；截断点回退到最近的完整段落或围栏闭合边界（`truncateNoteSnippet` 保证），截断后在片段尾部追加一行注明 `（片段截断自 <path> 行 <start>-<end>）`。

### 3.5 注入通道与可见性

1. `SendPipelineRuntime` 在 `prepareMessageSend` 之后（`:262` 附近）插入钩子：`vaultRetrievalEnabled === false` 时**直接跳过**（不做任何调用、不改写任何字段——关闭态逐字节一致的结构性保证）。
2. 开启时：`select(content)` → 每条结果构造成 `PromptContextItem`：
   ```ts
   { id, kind: 'file', path, label: `${path}:${startLine}-${endLine}`,
     mime: 'text/markdown', lineRange: { from: startLine, to: endLine },
     textSnapshot: truncateNoteSnippet(...)​.text,
     origin: 'vault-retrieval' }   // PromptContextItem 新增可选字段
   ```
   追加到 `preparedSend.contextItems` 末尾。片段文本在注入时回读（索引只存 token+行号），天然满足"修改后反映最新内容"（验收标准 5）。
3. 可见性：复用 composer 既有上下文 chips 与 `UserMessageContentRenderer` 的 `contextAttachments` 渲染（`:86-87`）；`origin === 'vault-retrieval'` 的 chip 带"检索"徽标（i18n 双语）。用户在发送前逐条点掉 chip → 该条不进入 `contextItems` → 不进入请求（验收标准 3）。设置里整体关闭 = 钩子不再产生任何条目。
4. `PromptContextItem` 只加**可选**字段，不改既有序列化形态；所有既有发送路径（手动上下文、目录、当前笔记）字节不变。

### 3.6 文件级改动清单

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/core/memory/vaultRetrievalIndex.ts` | 新 | 3.2 全部纯函数 + 常量（SOFT_CHUNK_CHARS、门槛规则） |
| `src/core/memory/VaultIndexService.ts` | 新 | 后台索引运行时（时间预算 tick、事件防抖、shard 读写） |
| `src/core/memory/index.ts` | 改 | 导出新模块 |
| `src/features/chat/runtime/SendPipelineRuntime.ts` | 改 | 注入钩子（构造函数新增可选 `vaultRetrieval?: { select(text): Promise<PromptContextItem[]> }` 依赖，由 `ChatRuntimeComposition` 装配） |
| `src/core/types/chat.ts` | 改 | `PromptContextItem.origin?: 'manual' \| 'vault-retrieval'` |
| `src/core/types/settings.ts` | 改 | 4 个设置 + 默认值 + 迁移归一化 |
| `src/features/settings/SettingsConversationSection.ts` | 改 | 检索设置块（开关/K/截断/排除规则编辑） |
| `src/i18n/locales/zh.ts` / `en.ts` | 改 | 双语条目 |
| `src/main.ts` | 改 | 构造 `VaultIndexService`（fs 适配器注入），随插件 `onunload` dispose |
| `docs/modules/core/memory/**` + owner 概况 | 改 | module-docs 硬门禁要求 |

---

## 4. 失败语义与安全约束

1. **关闭态逐字节一致（§6.6 + 验收 1）**：钩子入口第一行判断 `vaultRetrievalEnabled`；false 时函数即刻返回且不触碰 `preparedSend`。契约测试以"关 vs 无钩子"两组请求做字节级断言（§8.2）。
2. **fail-closed（§6.4）**：索引未就绪 / 检索抛错 / 读片段失败 → **本轮不注入**（返回空数组），Notice 不弹（避免每次发送被打断），错误进 debug 日志；绝不降级为"注入全部笔记"或部分注入。发送流程永不因检索失败而中断（检索在 try 内，吞掉自身异常）。
3. **显式与可见（§6.6）**：默认 `false`；开启动作在设置页完成；每次注入以 chips + 徽标可见、可逐条取消；整体关闭即时生效（钩子短路）。
4. **只读性**：索引器对 vault 只读（list/read）；唯一写动作在 `.opencodian/vault-index/**`。不触碰 R-B3 快照体系（无文档写入）。
5. **凭据/秘密**：注入片段走 `assembleRelevantMemory` 同款思路——如命中内容触发 `memorySecretScan` 的凭据启发式，该条丢弃并计入跳过数（在 debug 日志可见）。复用 `src/core/memory/memorySecretScan.ts`，不新造扫描器。
6. **性能安全**：构建 tick 时间预算（默认 8ms/tick，`requestIdleCallback`/`setTimeout` 分片）；防抖合并写事件；`dispose()` 清理全部定时器与事件订阅。
7. **§6.5 后端无关**：注入发生在发送管线装配层（`contextItems`），对所有后端同构；后端既有的 contextItems 序列化路径原样承载。

---

## 5. 测试计划

**单元（§8.1 R-C1 行 + 扩展）** — `tests/unit/core/memory/vaultRetrievalIndex.test.ts`、`VaultIndexService.test.ts`：

1. 打分与排序：字段权重、每 token 计一次、verbatim 置顶、tie-break；门槛规则（单 token 非标题命中被丢弃）。
2. 分块：标题节切分、超长节二分、代码围栏不穿越。
3. 截断边界：正好在围栏内的 maxChars 回退到围栏闭合；段落边界完整；`truncated` 标记正确。
4. 排除规则：`.obsidian/`、`.opencodian/` 默认排除；`templates/**` 等用户规则；大小写；`*` 通配。
5. 增量：modify → 单 shard 重写；delete → shard 清理；rename → 旧删新建；hash 相同跳过。
6. 秘密守卫：命中凭据启发式的片段被丢弃且计数。

**契约（§8.2 R-C1）**：

7. **关闭态逐字节回归**：同一会话同一输入，`vaultRetrievalEnabled=false` 的请求与当前实现（无钩子基线）逐字节一致——在 `SendPipelineRuntime` 层断言最终请求载荷。
8. 开启态：注入条数 ≤ `vaultRetrievalTopK`；每条含 path + 行号；取消一条后重建的 `contextItems` 不含该条。
9. `PromptContextItem.origin` 序列化：不带 origin 的旧条目输出不变（向后兼容断言）。

**真 CLI 端到端**：注入最终随四后端请求发出（opencode/claude-code/codex/pi 各跑一次关键路径，片段内容能被模型读到——比照既有 contextItems 真机验证方式）。

**真机（Obsidian，主智能体按 impl-plan §3.3 执行）**：

10. 约 1 万篇合成笔记初次索引后台完成，期间编辑器输入不卡顿，记录实测耗时（验收 4 的数据来源）。
11. 修改一篇笔记 → 下一次发送检索结果反映新内容（验收 5）。
12. `.opencodian/vault-index/` 不出现在 Obsidian 文件列表/快速切换/搜索（验收 6）。
13. 设置页四项可用、双语、关闭即时生效；注入 chips 徽标与逐条取消截图存档。

---

## 6. 验收标准映射（需求 R-C1 验收 1-6）

| # | 验收标准 | 设计如何使其可验证 |
|---|---|---|
| 1 | 关闭状态请求逐字节一致 | 钩子入口短路 + 契约测试 #7 字节级断言 |
| 2 | 开启 ≤ K 篇 + UI 显示清单（路径+片段位置） | `selectVaultSnippets` topK 硬上限；chips 显示 `path:startLine-endLine`；契约测试 #8 |
| 3 | 取消某条 → 不进请求 | 取消 = 从 `preparedSend.contextItems` 移除该 chip，序列化自然不含；测试 #8 |
| 4 | 1 万篇后台索引不卡顿（实测耗时） | 时间预算 tick + 防抖；真机步骤 10 输出实测数据 |
| 5 | 修改后检索反映最新内容 | 片段文本注入时回读（索引只存 token/行号）；mtime+hash 双重失效；真机步骤 11 |
| 6 | 索引目录不出现在 vault 常规列表/搜索 | `.opencodian/vault-index/**` 点前缀隐藏（既有三处 precedent）；真机步骤 12 |

---

## 7. 可行性验证结论

**已验证（本分支代码 + 运行中的 Obsidian 只读探查）**：

1. 词面打分原语存在、导出、被测试覆盖（`memoryRecall.ts:74-189`、`tests/unit/core/memory/memoryRecall.test.ts`）——复用零风险。
2. 注入通道存在：`SendPipelineRuntime` 的 `preparedSend.contextItems` → `sendStreamMessage`（`:427-435`）→ `PromptContextItem` 已支持 `lineRange`/`textSnapshot`——无需新请求形态、无需动 `OpenCodeService`。
3. owner 依赖已就绪：`feature.chat-runtime` 允许依赖 `core.memory`（inspect:owner 实测），无依赖放宽需求。
4. vault 事件面可用：`EditRevertService.ts:290-304` 已在生产使用 `vault.on('modify'/'create'/'delete')`。
5. 隐藏目录先例成立：三个既有 `.opencodian/**` 二进制/数据目录已在生产。

**未验证 / 留给实施阶段**：

1. 1 万篇笔记的实测索引耗时与索引体积——设计有 tick 预算与 100MB 上限保护，但绝对数字必须实测（验收 4 的数据只能来自真机）。
2. `tokenize` 的 CJK 二元组在整库规模下的查询延迟（记忆库是百级条目，整库是万级；查询是内存 token 交集，理论毫秒级，仍需真机确认）。
3. Obsidian 全文搜索是否索引点前缀目录——按 Obsidian 文档与插件生态惯例不索引，真机步骤 12 作为最终裁决。

---

## 8. 开放问题（需维护者裁决）

| # | 问题 | 建议 |
|---|---|---|
| C1-Q1 | 片段以 `PromptContextItem`（contextItems 通道）注入，还是拼进消息文本的 `<system-reminder>` 块（记忆召回式）？ | **建议 contextItems 通道**（本设计采用）：可见性/取消/渲染全部复用既有 UI，且不动消息文本（关闭态逐字节一致的证明面最小）。`<system-reminder>` 方案会改消息正文，回归面大。 |
| C1-Q2 | 检索是否也应该供行内编辑使用？ | 建议**不做**（本设计范围外）；行内编辑的上下文契约是显式附加（R-A7），混入自动检索会破坏其"所见即所发"语义。 |
| C1-Q3 | `memorySemanticRecallEnabled` 的误导命名是否顺手修复？ | 建议**另开维护性小任务**（含设置迁移），不与 C1 混合提交。 |
| C1-Q4 | 索引 shard 是否要在设置页暴露"重建索引"按钮？ | 建议一期提供（debug 分区），排除规则/版本升级变更后用户可手动触发。 |
