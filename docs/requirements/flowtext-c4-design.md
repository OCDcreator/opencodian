# R-C4 设计文档：PDF 读取 / 索引 / 内文交互

- 日期：2026-09-18
- 需求基准：`docs/requirements/flowtext-parity.md` R-C4（第 660-690 行），硬约束以该文档 §6/§11 为准
- 前置阅读：`docs/requirements/flowtext-parity-impl-plan.md` §1（共享约束）
- 状态：设计稿（待主智能体验收；实施前须先落 `architecture-owners.config.json` 的 owner 登记与 `docs/modules/**` 页面）

---

## 1. 目标与范围

### 1.1 范围内

| 期 | 内容 | 交付核心 |
|---|---|---|
| 一期（文本层） | 小体积 PDF 的文本层提取，作为对话上下文发送 | 新上下文条目类型 + 按需加载的提取引擎 |
| 二期（本地索引） | 数百页级 PDF 的本地切片索引与毫秒级检索，只注入命中片段 | 复用 R-C1 检索栈的 PDF 索引存储 |
| 三期（内文交互） | PDF 视图内选中原文 → 触发对话 → 结果可复制、可保存为注释 | PDF 视图集成层（可行性已验证，见 §7）+ 注释写路径 |

### 1.2 明确范围外（§11 非目标适用）

- **不做 OCR**。无文字层 PDF（扫描件）按 fail-closed 给出明确提示并指向降级路径，不尝试图像识别。
- **不做 Word / Excel / PPT**（§11.1）。
- **不写 PDF 二进制**。三期"保存注释"落在 markdown 侧车笔记，不修改 `.pdf` 文件本身；PDF 内高亮仅使用阅读器已有的临时高亮接口做视觉反馈，不做 PDF 文件内注释持久化。
- **不建第二套检索栈**（§11.4）。二期索引的打分/注入/开关体系全部复用 R-C1 的检索基础设施，本文只定义 PDF 侧的切片与存储格式。
- 不复用既有文本上下文通道：`textSnapshot` 字段语义保持"笔记原文文本"，PDF 条目引入独立结构化字段（§3.2）。

---

## 2. 现状证据（本分支已逐条核实，2026-09-18）

| # | 证据 | 位置 | 与需求文档的差异 |
|---|---|---|---|
| 1 | MIME 映射含 `pdf: 'application/pdf'`，是全仓库唯一的 PDF 相关代码 | `src/shared/obsidianContext.ts:32`（映射表起点）、`:61`（pdf 条目）、`:125`（未命中回退 `application/octet-stream`）、`:145`（`isTextLikeMime`） | 一致 |
| 2 | 远程模式下非文本 MIME 直接拒绝；本地模式 `textSnapshot` 留空、不解压任何内容 | `src/features/chat/services/ContextAttachmentBuilder.ts:113-141`（`buildFileContextItem`），拒绝分支 `:118-121`（notice `binaryUnsupportedRemote`），本地分支 `:123-131` | 需求文档写 `:86-114`，行号因 R-A7 目录条目合入而偏移，结论不变 |
| 3 | 无任何 PDF 解析依赖 | `package.json`（`grep -i pdf` 零命中） | 一致 |
| 4 | 上下文条目类型只有笔记语义四种 kind，快照字段为纯文本 | `src/core/types/chat.ts:59`（`PromptContextKind`）、`:66-74`（`PromptContextItem`）、`:76-83`（`MessageContextAttachment`） | 一致，此为一期必须新增条目类型的直接依据 |
| 5 | 只读辅助契约与写类工具审计 | `src/core/agents/backend/AgentAuxQueryCapability.ts:135-147`（`startAuxQuerySession` 只读契约）、`:154-162`（`AUX_DENIED_CAPABILITIES`）、`:169-193`（`WRITE_TOOL_PATTERNS`）、`:202`（`findWriteToolCalls`） | 需求文档行号 106-122/177-193 已偏移，契约内容不变 |
| 6 | R-B3 快照体系已存在，可承接本条所有写路径 | `src/core/storage/EditRevertService.ts`（`:99` 类定义、`:417` 回合起始预快照、`:473` 写工具声明快照、`:625/:653/:689` 回退/恢复）、`src/core/types/editRevert.ts` | 需求文档写作"纳入 R-B3"，实为现成 owner `core.storage` |
| 7 | R-C1 检索代码尚未落地（`vaultRetrieval` 在 src/tests 零命中），但其设计文档已定案：检索核心归 `core.memory`（`src/core/memory/vaultRetrievalIndex.ts` 纯函数 + `VaultIndexService.ts` 运行时），并明确否决新开 `core.retrieval` | 全仓 grep + `docs/requirements/flowtext-c1-design.md:54-65` | 二期对 R-C1 是**契约依赖**而非现有代码依赖，C4 依附 `core.memory`，见 §3.2 与 §8-D1 |
| 8 | `.opencodian/` 插件私有目录约定已有先例 | `src/core/memory/memoryPaths.ts`、`src/main.ts` | 二期索引存储沿用该约定 |

---

## 3. 技术方案

### 3.0 Owner 归属（`npm run inspect:owner` 已核实既有归属）

| 模块 | 归属 | 依据 |
|---|---|---|
| `src/core/types/chat.ts`（新增 `pdf_document` / `pdf_selection` kind 与 `PdfContextMeta`） | **core.types**（已核实） | 领域类型唯一之家 |
| `src/features/chat/services/ContextAttachmentBuilder.ts`（新增 PDF 条目构建） | **feature.chat-services**（已核实） | 上下文条目构建的现役 owner |
| `src/core/storage/EditRevertService.ts`（注释写路径的预快照，仅消费） | **core.storage**（已核实） | R-B3 现役实现 |
| 新增 `src/core/pdf/**`（提取引擎加载器、索引存储、阅读器内部结构探测） | **建议登记新 owner `core.pdf`** | 独立子系统（实施计划批次 C 明言"每条都是独立子系统"）；隔离高风险的版本敏感依赖（pdf.js 内部结构与 pdfjs-dist），符合守则"隔离高风险依赖"的例外；不是薄适配层——它承载真实的提取、缓存与探测职责 |
| 三期视图集成（工具栏按钮、选区捕获、命令） | **feature.chat-services** 扩展（上下文挂载亲和物）+ `app.composition` 注册命令（`src/main.ts` 既有命令注册模式） | PDF 视图内挂的 UI 的行为终点是"构建上下文条目并打开聊天"，属于 chat-services 既定职责；不为单点挂载新开 feature owner |

owner 登记是实施期动作：改 `architecture-owners.config.json` 后须过 `npm run check:owner-manifest` 与 `npm run check:module-docs`。

### 3.1 一期：文本层提取与新上下文条目

**依赖与加载策略（决策已定：按需加载，不进启动路径）**

- 引入 `pdfjs-dist`（纯 JS，无原生二进制，无 `doctor:esbuild` 类平台问题；版本在实施期锁定并记录）。
- 构建产物**双入口**：`esbuild.config.mjs` 增加第二入口，产出 `dist/pdf-engine.js`（pdfjs-dist + 提取逻辑），`main.js` 只含一个十几行的运行时加载器。启动零额外解析成本；首次 PDF 附加/建索引时经 `require(path.join(manifest.dir, 'pdf-engine.js'))` 加载，失败 fail-closed（§4）。
- 体积评估口径：`pdf-engine.js` 为 MB 级（实施期以 `ls -la dist/` 实测并回填需求文档状态列），但因不进 `main.js`，不触碰插件启动敏感路径；不采用 CDN 加载（离线与安全约束），不尝试复用 Obsidian 内嵌 pdf.js（未导出，见 §7）。

**接口（核心签名）**

```ts
// core.types：新增
export type PromptContextKind = 'current_note' | 'selection' | 'file' | 'folder'
  | 'pdf_document' | 'pdf_selection';                       // chat.ts:59 扩展

export interface PdfPageText { page: number; text: string; }

export interface PdfContextMeta {
  textLayerPresent: boolean;   // fail-closed 判定结果
  pageCount: number;
  extractedChars: number;
  extraction: 'embedded';      // 一期仅内嵌 pdf.js 提取；OCR 永不在列
}

export interface PromptContextItem {                          // chat.ts:66 扩展
  // ...既有字段不动；pdf 条目不写 textSnapshot
  pdf?: PdfContextMeta;
  pdfPages?: PdfPageText[];    // 结构化承载，供一期注入与二期切片复用
}

// core.pdf：提取引擎（dist/pdf-engine.js 内实现，主包只持接口）
export interface PdfTextEngine {
  extractPages(data: ArrayBuffer, opts: { maxPages: number }): Promise<{
    pageCount: number;
    pages: PdfPageText[];
  }>;
}
```

**提取流程（`core.pdf`）**

1. `vault.readBinary(file)` 取字节；加密 PDF（pdf.js `PasswordException`）→ 明确提示后终止。
2. 逐页 `getTextContent()`，按条目 y 坐标聚类重建行、按页拼接；`page` 从 1 起。
3. **无文字层判定**：全文提取字符数 < 32 且有字页占比 < 20% → `textLayerPresent: false` → fail-closed 提示"该 PDF 无文字层（扫描件），无法提取文本"（验收 1 的后半句），不注入空快照。
4. 上限：一次性附加上限页数/字符数为模块常量（不新增设置项，§7 只列 `pdfIndexEnabled`）；超限**拒绝并提示**改用二期索引或指定页范围，不静默截断（§6.4）。

**序列化**：`OpenCodeContextPartSerializer` / OMO 装配器按既有 `<attached_context>` 管线渲染 `pdf_document` 条目，头部为 `# PDF 附件：<path>（共 N 页，提取 M 字符）`，正文为页文本。四后端一致（后端无关是验收项，§6.5）。

### 3.2 二期：本地索引（复用 R-C1 检索栈，决策已定）

**依赖契约（R-C1 设计已定案，见 `flowtext-c1-design.md` §3.2；实施顺序 C1 先于 C4）**

C4 消费 `core.memory/vaultRetrievalIndex.ts` 的既有原语，**不复制打分逻辑**（§11.4）：

- `scoreChunk(queryTokens, chunk)`：词面打分（tokenize 复用 memoryRecall：拉丁词 + CJK 二元组）；
- `selectVaultSnippets` 同款选段门槛（`score>0` 且至少命中 2 个不同查询 token 或 verbatim 命中，否则丢弃）与 topK 语义；
- `VaultIndexFs` 注入模式（索引 I/O 依赖注入，便于单测）。

PDF 块与笔记行的锚定差异处理：`VaultIndexChunk` 的定位字段是行号（`startLine/endLine`），PDF 块是页区间。C4 在 `core.pdf` 内持有页锚定的 `PdfIndexChunk` 表，调用打分原语时将 `pageFrom/pageTo` 映射到 `startLine/endLine` 字段位（仅作结构复用）；若实施中发现 `scoreChunk` 签名强绑定行语义，则在 `core.memory` 内补一个行无关的 `scoreTokens` 原语供两栈共用——这是对 R-C1 的纯重构，不是第二套检索栈。

**PDF 侧存储（`core.pdf`）**

- 路径：`.opencodian/pdf-index/<sha1(vault相对路径 + mtime + size)>.json`，内容为 `PdfPageText[]` 按块合并后的切片表：

```ts
interface PdfIndexChunk {
  id: string;            // "<pdfPath>#<page>-<charFrom>"
  pageFrom: number; pageTo: number;
  text: string;          // 目标 800–1200 字符，段落边界切分（PDF 无代码块语义）
}
interface PdfIndexFile {
  version: 1;
  pdfPath: string;
  fingerprint: string;   // sha1(path+mtime+size)，不匹配即整体重建
  ready: boolean;        // 构建完成后才置 true；未 ready 的文件永不参与检索
  chunks: PdfIndexChunk[];
}
```

- 原子性：先写 `<file>.tmp` 再改名；`ready` 标记保证"半截索引不可查"。
- 失效与清理：fingerprint 不匹配即重建；孤儿索引（对应 PDF 已删）在构建批末惰性清除；总量上限复用 R-B3 的容量治理思路（超限淘汰最久未命中）。
- 开关：`pdfIndexEnabled`（§7，默认 `false`）；topK 与单篇字符截断复用 R-C1 的 `vaultRetrievalTopK` / `vaultRetrievalMaxCharsPerNote` 语义，不新增平行旋钮。
- 构建调度：空闲时分批（每批若干页后 `await` 让出主循环），`AbortController` + 代际计数支持取消；进度在聊天面板上下文区可见（验收 4："UI 不阻塞 + 可中断"）。
- 关闭态回归：`pdfIndexEnabled=false` 时请求字节与现状完全一致（对齐 §8.2 对 R-C1 的严格回归要求）。

### 3.3 三期：内文交互（可行性已实测，结论见 §7；设计按"主路径 + 三级降级"落地）

**数据流**

```
PDF 视图选中文本
  → PdfSelectionBridge（feature.chat-services，DOM selectionchange/mouseup 监听 containerEl）
  → 构建 kind:'pdf_selection' 条目 { path, pdf: meta, pdfPages:[{page, text}], pdfRange? }
  → 复用既有 ComposerContext 挂载路径打开对话
  → 回复卡片提供 复制 / 保存为注释 两个动作
```

```ts
// core.types：pdf_selection 专属定位信息
export interface PdfSelectionRange {
  page: number;
  /** Obsidian 原生序列："startIdx,startOffset,endIdx,endOffset"；
   *  与 PDF 链接子路径 #page=N&selection=... 同构，可回链高亮（§7 探测 2）。*/
  rangeStr?: string;      // 序列化失败时缺省，退化为仅 page 定位
  text: string;           // 主载荷，恒必填
}
```

**选区捕获（两级实现）**

1. 首选：`viewer.child.getTextSelectionRangeStr(ctx)` —— Obsidian 自带的选区序列化（§7 探测 2 已核实其算法：`ctx.win.getSelection()` → range → `dataset.idx` 容器映射 → 字符偏移）。`ctx` 的具体形态未公开，实施首日以"包装该方法记录 Obsidian 原生调用入参"的 5 分钟诊断确定；确定后即为最稳路径。
2. 兜底：直接读 `containerEl.ownerDocument.getSelection()`（纯 DOM API，实测可用），文本取 `range.toString()`；`page` 由 range 节点向上找 `.page[data-page-number]` 得出（DOM 结构已实测，§7 探测 1）。`rangeStr` 缺省，链接退化为 `[[file.pdf#page=N]]`。
3. 两级都失败（内部结构缺失）→ 降级路径 C（下文）。

**入口（两个，均为 feature-detect 后注册）**

- 工具栏按钮：`viewer.child.toolbar.toolbarLeftEl/toolbarRightEl` 为 HTMLElement，实测可挂载/移除 `clickable-icon`（§7 探测 1）。
- 命令：`pdf:ask-selection`（`app.composition` 注册，命令面板可发现；对内部结构零依赖，永不可用性最低）。

**保存为注释（唯一新写路径，显式且有限）**

- 目标：markdown 侧车笔记，默认 `<pdf 文件名>.annotations.md` 与 PDF 同目录（§8-D2），追加格式：

```markdown
- 2026-09-18 12:00 · [[file.pdf#page=3&selection=0,12,45,88]]
  > 选区原文摘录（≤200 字）
  - **问**：…
  - **答**：…
```

- 写入语义：写前 `EditRevertService` 预快照（R-B3）→ 单次 `vault.process` 追加（文件不存在则 `vault.create`），闭包内先读后写即脏检查；`process` 抛错 → 零改动并明确提示。每条注释落盘前在 UI 预览、可取消（§6.3 可见性）。
- 视觉反馈：写成功后若 `child.highlightText(page, rangeStr)` 可用（§7 探测 2，临时高亮、不落 PDF 文件）则高亮选区；不可用则只提示成功。
- **不写 PDF 二进制**（§1.2）；PDF 文件自身永远零变化，可用"vault 快照审计"验证。

**降级阶梯（§6.7 如实呈现）**

| 级 | 能力 | 前提 |
|---|---|---|
| A | 工具栏按钮 + 选区序列化 + `#page&selection` 回链 + 高亮反馈 | 全部内部接口 feature-detect 通过 |
| B | 命令入口 + DOM 选区文本 + 仅 `#page=N` 定位（无 rangeStr） | DOM selection 可读 |
| C | 命令打开对话窗 + 手动粘贴文本（需求文档指定的降级形态） | 零内部依赖，恒可用 |

当前版本实测支持 B（并大概率支持 A，待实施首日实测闭环）；任何一级失效自动落到下一级，设置页调试区显示当前生效级别，不伪装成功。

---

## 4. 失败语义与安全约束（对照 §6 逐条）

| §6 约束 | 本设计的落实 |
|---|---|
| 1 只读辅助契约不削弱 | 一/二/三期均**不触碰** `AgentAuxQueryCapability`；问答走正常聊天会话，无新 aux 形态；`findWriteToolCalls` 审计原样 |
| 2 写路径显式且有限 | 全条唯一新写路径 = 注释侧车笔记的单次 `vault.process`/`vault.create`；索引写仅落插件私有 `.opencodian/pdf-index/`（非用户文本）；禁止任何"顺手写文件系统" |
| 3 落盘前脏检查 | 注释写入在 `vault.process` 闭包内先读后写 + R-B3 预快照双重保障 |
| 4 fail-closed 优先 | 无文字层 / 加密 / 超页上限 / 超字符上限 / `pdf-engine.js` 加载失败 → 一律明确提示并拒绝，不静默降级、不注入空内容 |
| 5 后端无关是验收项 | 注入物是提示词文本，四后端同一序列化；验收含四后端比对 |
| 6 自动注入显式可见 | PDF 上下文只能由用户显式附加（picker/拖拽/工具栏/命令），无自动注入；条目在上下文区可见可逐条移除 |
| 7 能力缺失如实呈现 | 三期降级阶梯公开（调试区显示当前级别），验证失败即按 C 级交付，不伪装 A 级 |

---

## 5. 测试计划

**单元（jest，纯函数，对齐 §8.1）**

- 行重建：getTextContent 条目 → 行/页文本的聚类（含坐标乱序、同页多栏的次优但确定输出）。
- 无文字层判定：空 items / 少量字符 / 阈值边界。
- 索引：切片合并边界（页界不跨 chunk）、fingerprint 失效重建、`ready=false` 不参与检索、孤儿清理、tmp→改名原子性。
- 注释序列化：时间戳、selection 子路径链接、摘录截断、Q&A 转义。
- 上限拒绝：页数/字符常量边界。

**契约（跨模块，对齐 §8.2）**

- `pdf_document`/`pdf_selection` 条目在四后端序列化一致；关闭 `pdfIndexEnabled` 时请求与现状逐字节一致（严格回归）。
- 注释写入前后 PDF 文件字节零变化；`EditRevertService` 能回退注释追加（含"恢复回退"对称性）。
- `pdf-engine.js` 缺失/损坏 → 功能关闭态运行，主路径零影响。

**真 CLI 端到端（§8.3 精神，真实模型）**

- 一期：附加有文字层 PDF → 提问 → 回答引用页内具体内容（四后端各跑一轮）。
- 二期：数百页 PDF 建索引 → 检索问答引用具体片段 → 实测检索耗时并回填验收 2。

**实机（Obsidian，主智能体执行）**

- 三级降级逐级演练：正常 A 级全流程（选中 → 对话 → 保存注释 → 点击回链跳转高亮）。
- 扫描件（本库现有两个无文字层样本可复用）→ 明确提示。
- 索引构建中取消、UI 可交互性、大文件不卡顿。
- Obsidian 升级后运行 `core.pdf` 的内部结构探测自检（存在性断言脚本），失效则确认自动落 B/C 级。

---

## 6. 验收标准映射（需求 R-C4 验收 1–4 逐条）

| # | 验收标准 | 设计如何使其可验证 |
|---|---|---|
| 1 | 一期：可从 PDF 提取文本并作为上下文发送；无文字层 PDF 给出明确提示 | `pdf_document` 条目 + `pdfPages` 结构化注入（§3.1）；`textLayerPresent=false` 分支的固定提示文案可断言；单测 + 真模型 E2E |
| 2 | 二期：数百页 PDF 建索引后问答引用具体片段；检索响应时间达标（实测） | 切片表 + `LexicalRetrievalCore.topK` 注入；E2E 强制记录检索毫秒数回填需求文档状态列 |
| 3 | 三期（可行性通过）：PDF 内选中 → 对话 → 结果可保存到笔记注释 | §7 已实测选区可读、按钮可挂；注释写入有预览确认 + 回链链接可点击验证；实机截图存档 `artifacts/opencodian/flowtext-parity/` |
| 4 | 索引构建期间 UI 不阻塞，且可中断/取消 | 分批让出主循环 + AbortController；实机验收为构建中执行打字/滚动操作 + 取消后 `ready` 不置位、无半截索引可查 |

---

## 7. 可行性验证结论（三期关键未知项，实测记录）

**环境**：macOS 桌面版 Obsidian 1.13.4（UA `obsidian/1.13.4`，Electron 43.1.1 / Chromium 150），测试库 `testvault`；只读探测（`obsidian eval`），未改任何库内文件与设置；临时 PDF 写在 `/tmp` 并已清理；打开的探测标签页已还原关闭。

**探测 1 —— 视图与 DOM（实测 ✅）**

- `app.workspace.getLeavesOfType('pdf')` 可枚举；`leaf.view.viewer.child` 暴露 `pdfViewer`、`toolbar`、`findBar`、`file` 等。
- `child.pdfViewer` 即 pdf.js **v5.3.34**（build cc1e2a3e0）的 application 对象：`pdfDocument`（`numPages`、`getPage(n)`）、内层 `pdfViewer`（`_pages`、`pagesCount`）、`eventBus`（`on`/`dispatch`）。
- DOM：`.pdf-toolbar` + `.pdf-container`；`.page` 带 `data-page-number`、`data-loaded`；文本页有 `.textLayer`（扫描件为空）。
- **文本提取实测成功**：将 `/tmp` 下自制含文字 PDF 经 `child.pdfViewer.open({url:'app://<appIdHash>/tmp/...'})` 载入后，`pdfDocument.getPage(1).getTextContent()` 返回 `"Hello OpenCodian PDF probe"`。库内两个 PDF 返回空，经原始字节核验（218 字节残缺文件；3.3MB 纯图像、零 `/Font`）确属文件本身无文字层，非 API 问题。
- **工具栏可挂载实测成功**：向 `toolbar.toolbarRightEl`（HTMLElement）`appendChild` 一个 `clickable-icon` 按钮成功并可移除（注：该构建中右侧区为空，实施期需目测布局）。

**探测 2 —— 选区序列化与高亮（源码级核实 ✅，运行时闭环 ⏳）**

- `child` 原型方法含 `getTextSelectionRangeStr(ctx)` / `highlightText(page, rangeStr)` / `clearTextHighlight` / `getAnnotatedText` / `getTextByRect` / `highlightAnnotation` / `onAnnotationPointerDown` / `onMobileCopy`。
- 反编译源核实算法：`getTextSelectionRangeStr` 读 `ctx.win.getSelection()`，把起止容器经 `dataset.idx` 映射、字符偏移换算，产出 `"startIdx,startOffset,endIdx,endOffset"`——与 PDF 链接 `#page=N&selection=...` 子路径同构；`highlightText` 用该串经 `page.textLayer.textLayer.textDivs/textContentItems` 反向定位并滚动高亮。**这正是三期"选中 → 对话 → 注释回链"需要的原生原语，且无需自研序列化。**
- ⏳ 未闭环项：`ctx` 入参形态未公开（`.win` 不在 child/viewer 自有属性上，疑为内部调用方构造的页面对象）；且库内样本均无文字层，无法当场完成"真实选中 → 序列化 → 高亮"全链路。**实施首日任务**：造一个有文字层的库内样本 PDF（实施期允许），包装 `getTextSelectionRangeStr` 记录原生调用入参，5 分钟内可定；若不可定则走 §3.3 兜底（DOM selection 直读，B 级）。
- 另核实：pdf.js 提取与渲染均可用，但 Obsidian 未把内嵌 pdf.js 导出为模块（`window.pdfjsLib` undefined、asar 内位于 `lib/pdfjs` 私有目录）——**一期仍需自备 pdfjs-dist**，不能白嫖宿主。

**结论**

- **一期：完全可行**（自备 pdfjs-dist + 二入口懒加载；实测 API 语义无误）。
- **二期：完全可行**（纯本地 JSON 索引 + R-C1 词面打分；无技术未知）。
- **三期：有条件可行，判 A→B→C 三级降级**。选区文本读取与工具栏挂载已实测成立（B 级具备）；`rangeStr` 序列化高概率成立（源码级确认存在且算法明确，入参待实施首日闭环）。即使全部内部接口在某个 Obsidian 版本失效，C 级（命令 + 手动粘贴）恒可用——降级形态已在 §3.3 具体化，不假装 A 级永真。

---

## 8. 开放问题（需裁决）

| # | 问题 | 建议 | 理由 |
|---|---|---|---|
| D1 | ~~检索核心落点~~ **已随 C1 设计定案**：依附 `core.memory`（`vaultRetrievalIndex.ts`），否决 `core.retrieval` | C4 遵从该定案，仅剩一个实施期小项：`scoreChunk` 若强绑定行语义，是否在 `core.memory` 补行无关的 `scoreTokens` 原语 | 避免两套检索栈（§11.4）；原语抽取属纯重构，须 C1 owner 认可后实施 |
| D2 | 注释侧车笔记的默认位置 | **`<pdf 名>.annotations.md` 与 PDF 同目录**，文件名模板为常量不设设置项 | 与 PDF 同目录符合 Obsidian 附件习惯；少一个设置项；必要时用户可移动 |
| D3 | pdfjs-dist 引入形态 | **双入口 `dist/pdf-engine.js` 懒加载**；实施期锁版本、实测体积并回填 | 启动零开销满足体积敏感约束；避免 CDN（离线）与复用宿主（不可行，已实测） |
| D4 | 三期入口默认形态 | **命令 + 工具栏双入口**，工具栏挂载失败自动只留命令；不新增设置项 | 命令零依赖恒可用；工具栏体验最优；降级逻辑内建无需用户选择 |
