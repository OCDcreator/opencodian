# R-C5 设计文档：Canvas 生成与节点级 AI

- 日期：2026-09-18
- 需求基准：`docs/requirements/flowtext-parity.md` R-C5（第 693-721 行），硬约束以该文档 §6/§11 为准
- 前置阅读：`docs/requirements/flowtext-parity-impl-plan.md` §1（共享约束）
- 状态：设计稿（待主智能体验收；实施前须先落 `architecture-owners.config.json` 的 owner 登记与 `docs/modules/**` 页面）

---

## 1. 目标与范围

### 1.1 范围内

| 能力 | 内容 | 核心机制 |
|---|---|---|
| Canvas 生成 | 依据选定的笔记集合（或 R-B2 主题组）生成新的 `.canvas`，每篇笔记一个节点；可选 AI 主题拆分（一篇 → 多个文本节点） | `.canvas` JSON 直读直写（vault API）+ 确定性网格布局 + 原子落盘 |
| 节点级 AI 编辑 | Canvas 内选中节点 → 触发 AI 改写节点内容（如改写为 Mermaid 代码块）→ 预览确认 → 写回 | 只读 aux 会话改写 + 确认对话框 + 双模式写回（文本节点 / 文件节点） |
| 连接节点 | 生成与改写时由 AI 提议节点间连线（edges），确认后写入 | edges 数组原子更新，同走快照 |

### 1.2 明确范围外（§11 非目标适用）

- **不修改既有 `.canvas` 或既有笔记来"生成"**：生成永远是新增文件；对既有文件的唯一写路径见节点级编辑（显式确认 + 快照）。
- **不做力导向布局**（需求技术约束已定案）：只用确定性网格/分层布局。
- **折叠/展开如实标注**：Obsidian 原生 Canvas 无"节点折叠"语义（group 是容器而非折叠态）；FlowText 的折叠是其自有白板 UI 能力。本设计以 **group 聚类**（AI 拆分时把同主题节点包进 group 节点）作为替代并如实呈现，不伪装实现了折叠。
- 不做 Canvas 的通用自动化（批量移动、自动排版既有画布等）。
- 不引入第二套图片/资产传输或向量依赖（§11.4）。

---

## 2. 现状证据（本分支已逐条核实，2026-09-18）

| # | 证据 | 位置 |
|---|---|---|
| 1 | `src/` 内零 `.canvas` 处理逻辑：`getLeavesOfType('canvas')` 及 `.canvas` 文件读写零命中；`canvas` 关键词命中全部为渲染内部（`glassOctahedronDemo.ts`、`shuding*.ts` 的 `canvasEl`/`canvasCtx`） | 全仓 grep 复核一致 |
| 2 | `.canvas` 不在 MIME 映射 → 回退 `application/octet-stream` → 远程模式按二进制拒绝 | `src/shared/obsidianContext.ts:32-125`（映射表与 `:125` 回退）、`src/features/chat/services/ContextAttachmentBuilder.ts:118-121`（拒绝分支） |
| 3 | `.canvas` 是 JSON：`nodes`（`id`/`type`/`file`/`x`/`y`/`width`/`height`）/`edges` | 库内真实文件 `SynthNote/Canvas/Runtime.canvas` 实读核验 |
| 4 | R-B3 快照体系已存在（新建文件回退进回收站是既有语义） | `src/core/storage/EditRevertService.ts:99`（类）、`:625/:653/:689`（revert/restore/revert-all）、`src/core/types/editRevert.ts` |
| 5 | 只读 aux 会话契约（节点改写的唯一 AI 通道） | `src/core/agents/backend/AgentAuxQueryCapability.ts:135-147`（`startAuxQuerySession`）、`:154-162`（`AUX_DENIED_CAPABILITIES`）、`:169-193` + `:202`（`findWriteToolCalls` 阻断审计） |
| 6 | 行内编辑已有经过审计的响应解析契约，可复用其解析层 | `src/features/inline-edit/InlineEditService.ts`（owner `feature.inline-edit`，已核实） |

---

## 3. 技术方案

### 3.0 Owner 归属（既有归属经 `npm run inspect:owner` 核实）

| 模块 | 归属 | 依据 |
|---|---|---|
| 新增 `src/core/canvas/**`（schema、布局、生成服务、写回服务） | **建议登记新 owner `core.canvas`** | 独立子系统（实施计划批次 C 明言）；承载真实的 JSON schema/布局/原子写职责，非薄适配层 |
| 新增 `src/features/canvas-integration/**`（Canvas 视图内的选区桥、菜单挂载、预览对话框装配） | **建议登记新 owner `feature.canvas-integration`** | 外来宿主视图（Canvas）内的 UI 集成，先例是 `feature.inline-edit`（在编辑器宿主内挂 UI 的独立 feature owner）；不塞进 `feature.chat-*`，避免 chat owner 吸收外来视图运行时 |
| `src/main.ts` 命令注册 | **app.composition**（已核实） | 既有命令注册模式 |
| 只读 aux 会话消费 | `feature.inline-edit` 的会话编排为参照实现；本条在其接缝（`AgentAuxQueryCapability`）上消费，不修改契约 | §6.1 |
| 写路径快照 | 消费 **core.storage** 的 `EditRevertService`（已核实） | §6.2 |

owner 登记是实施期动作：改 `architecture-owners.config.json` 后须过 `npm run check:owner-manifest`、`npm run check:module-docs` 与 `npm run graphify:update:src`。

### 3.1 Canvas JSON schema 与校验（`core.canvas/CanvasDocument.ts`）

```ts
export interface CanvasNodeData {
  id: string;                       // nanoid 风格，生成器本地唯一即可
  type: 'text' | 'file' | 'group' | 'link';
  x: number; y: number; width: number; height: number;
  text?: string;                    // type:text
  file?: string;                    // type:file，vault 相对路径
  color?: string;                   // "1".."6"
  label?: string;                   // type:group
}
export interface CanvasEdgeData {
  id: string; fromNode: string; toNode: string;
  fromSide?: 'top'|'right'|'bottom'|'left'; toSide?: same;
  label?: string;
}
export interface CanvasDocument { nodes: CanvasNodeData[]; edges: CanvasEdgeData[]; }

export function parseCanvasDocument(json: string): CanvasDocument;   // 宽松读：容忍未知字段，原样保留
export function serializeCanvasDocument(doc: CanvasDocument): string;
export function assertWritableDocument(doc: CanvasDocument): void;   // 严格写前校验：id 唯一、边端点存在、坐标有限数、type 合法；失败抛出，fail-closed
```

- `parse` 宽松（读既有画布不因未知字段崩溃，保留原字段实现**往返无损**）；`assertWritableDocument` 严格（自己写出的文件必须结构合法，验收 2 的自动化判据）。
- 序列化确定性：固定键序（id/type/…）+ 固定缩进，同输入恒同输出（可 golden 测试）。

### 3.2 确定性布局（`core.canvas/CanvasLayout.ts`，决策已定：网格/分层，非力导向）

```ts
export interface LayoutInput { count: number; groups?: number[]; }   // groups = 每组节点数（分组布局时）
export function layoutGrid(input: LayoutInput): Array<{x:number;y:number;width:number;height:number}>;
```

- 常量：节点 `width=360, height=160`（与库内既有画布实测尺寸一致，§2-3），水平间距 60，垂直间距 60，group 内边距 40。
- 规则（纯函数、无随机、无时钟）：
  - ≤ 4 个节点：单行排列。
  - ≥ 5 个节点：每行 3 个的网格（阅读序从左到右、从上到下）。
  - AI 分组模式：每组一列纵向堆叠，组间横向排列并包 group 节点（替代"折叠"的范围外项，见 §1.2）。
- 同输入必同输出 → 布局单测可用黄金值断言（n=1/3/7/20 + 分组场景）。

### 3.3 Canvas 生成（`core.canvas/CanvasGenerationService.ts`）

**输入解析**：命令 `canvas:generate-from-notes` 的来源三选一——R-A7 上下文 picker 多选结果、R-B2 主题组（存在时提供二级选项）、文件浏览器多选态（内部 API，feature-detect，拿不到就静默回退 picker）。见 §8-E3。

**两种模式**

1. **文件引用节点（默认，零 AI）**：每篇笔记一个 `type:'file'` 节点，`file` 为 vault 相对路径；Obsidian 原生渲染笔记内容。无内容拷贝、无 token 成本、笔记改名由 Obsidian 原生更新引用。
2. **AI 主题拆分（可选）**：只读 aux 会话输入各笔记全文（受单篇字符上限约束，超限拒绝该篇并明示），要求输出结构化拆分提案 `{topic, sourcePath, excerpt}[]`；**AI 只提案不落盘**，插件把 excerpt 做成 `type:'text'` 节点并以 group 聚类。会话走 `startAuxQuerySession`（只读契约、`findWriteToolCalls` 审计原样生效，§6.1）；提案解析失败/会话失败 → 明确提示并**回退模式 1**（不用一个坏结果伪装成功，§6.4）。

**原子落盘（验收 4：失败不留半个文件）**

1. 目标路径：用户当前目录下 `<主题或 'Untitled'> canvas.canvas`；重名**不覆盖**——`getAbstractFileByPath` 预检并追加序号 ` 2`、` 3`…直到可用名。
2. 内容**先全部在内存构建**（节点 + 边 + 布局），`JSON.parse(serialize(doc))` 往返 + `assertWritableDocument` 双重校验通过后才触盘——触盘前不可能存在半截文件。
3. 单次 `vault.create(path, json)`；`create` 抛错 → 零改动提示。抛错后若文件仍被创建（理论边界）→ catch 内 `vault.delete(created, true)`（进回收站）回收并提示。
4. 创建成功后把新文件登记进 `EditRevertService`（R-B3：新建文件回退 = 进回收站，语义现成）。

### 3.4 节点级 AI 编辑（`feature.canvas-integration` + `core.canvas/CanvasNodeWriteService.ts`）

可行性结论先行：**有条件可行**（静态核实 + 运行时未验，详见 §7）。设计按"运行时确认门 → 主路径 → 命令降级 → 结果回传"四级落地。

**运行时确认门（实施第一个任务，硬门禁）**：在测试库启用核心 Canvas 插件（实施期由主智能体执行，本次设计阶段因只读探测约束未启用，见 §7），实测 §7 所列 API 逐项存在。任何一项缺失 → 节点编辑功能整体不注册，如实显示"当前 Obsidian 版本不支持"，**不**带病上线（§6.7）。

**入口（挂 UI）**：Canvas 浮动选择菜单（bundle 核实类名 `canvas-menu-container` → `canvas-menu`，§7 探测 2）内 `appendChild` 一个"AI 改写"图标按钮（DOM 追加是低风险原语）；同时在 `onSelectionContextMenu` 的上下文菜单与命令面板提供等价入口。三入口同一处理器。

**读选中节点**：`view.canvas.selection`（bundle 核实为 `Set`）→ 逐节点 `node.getData()`（bundle 核实各类型实现）→ 取 `text`（文本节点）或 `file`（文件节点，正文经 `vault.read` 只读获取）。多选时只处理第一个并提示（最小可用，§6.2 有限性）。

**AI 改写（只读会话，契约不新建）**：`startAuxQuerySession` + 行内编辑既有响应严格解析层（`feature.inline-edit` 的 parser，owner 已核实）——输出必须恰为该节点的新内容；`findWriteToolCalls` 命中即丢弃结果并提示（既有阻断语义）。提示词模板要求：只改写、不扩写成长文、目标是 Mermaid 代码块时输出单个 ```mermaid 块。

**确认与写回（区分节点类型，两条都显式且有限）**

- **文本节点**（`canvas.setData` 全文档回写）：
  1. **脏检查**：重新 `node.getData().text`，与会话起始快照比对，不一致 → 拒绝并提示"节点已被修改"（§6.3）。
  2. 预览对话框：原文 / 新文（Mermaid 目标时带渲染预览）→ 确认/取消。
  3. `doc = canvas.getData()`（bundle 核实遍历 `this.nodes`）→ 内存中替换目标节点条目 → `assertWritableDocument` → `canvas.setData(doc)`（bundle 核实消费 `{nodes:[...]}`）→ `canvas.requestSave()`（bundle 核实 `dirty=true` + 去抖保存）。**不直接写文件**，保存仍由 Canvas 自身管线完成。
- **文件节点**（底层笔记即一篇 markdown，走既有文本写语义）：
  1. 预览确认同上，明确标注"将修改笔记 `<path>`"。
  2. `EditRevertService` 预快照 → 单次 `vault.process` 闭包内**先读比对（脏检查）后写** → 成功提示；闭包抛错零改动。
- **撤销语义（如实）**：`Ctrl+Z` 依赖 Canvas 原生 undo 对 `setData` 路径的覆盖，**未经验证**（§7-U3）。保证性撤销 = R-B3 回退入口（后端与视图无关）；验收 3 按实测如实记录：原生 undo 可用则双通道，不可用则 R-B3 单通道并明示。

**降级阶梯（§6.7）**

| 级 | 能力 | 前提 |
|---|---|---|
| A | 菜单/右键按钮 + 直读写回 | 确认门全过 |
| B | 命令面板入口（`canvas:ai-edit-node`）读 `canvas.selection`，其余同 A | `view.canvas` 结构可读 |
| C | 选节点 → 命令 → 对话框列出 `canvas.getData()` 全部节点供挑选（不依赖 selection 集合） → 其余同 A | `getData` 可用 |
| D | 改写结果只回传聊天/对话框并复制，用户手动粘贴（诚实终态，对齐 R-C4 三期 C 级精神） | 恒可用 |

---

## 4. 失败语义与安全约束（对照 §6 逐条）

| §6 约束 | 本设计的落实 |
|---|---|
| 1 只读辅助契约不削弱 | AI 拆分与改写都走 `startAuxQuerySession` 只读会话；无新 aux 形态、无新工具授权；`findWriteToolCalls` 审计保持阻断；AI 永远只提案，写动作全部由插件显式执行 |
| 2 写路径显式且有限 | 全条写路径恰三条，均显式定义：① 生成新 `.canvas`（单次 `vault.create`）；② 文本节点写回（`canvas.setData`+`requestSave`，走 Canvas 自身保存管线）；③ 文件节点写回（单次 `vault.process`）。索引之外的文件系统访问为零 |
| 3 落盘前脏检查 | 生成：触盘前双重校验（§3.3-2）；文本节点：写回前重读比对；文件节点：`vault.process` 闭包先读后写 + R-B3 预快照 |
| 4 fail-closed 优先 | schema 校验失败 / aux 提案解析失败 / 会话失败 / 确认门失败 / 节点已变更 → 一律拒绝并提示；拆分失败回退文件引用模式是**明确提示下的替代**，不是静默降级 |
| 5 后端无关是验收项 | aux 会话四后端同构（既有能力面）；某后端 aux 不可用 → 如实显示"该后端不支持"，改写入口禁用并说明 |
| 6 自动注入显式可见 | 无自动注入；所有动作由显式命令/按钮发起，写前必有预览确认 |
| 7 能力缺失如实呈现 | Canvas 插件未启用 / 确认门失败 → 功能不注册 + 明确说明；折叠能力以 group 替代并明示（§1.2）；§7 区分实测/静态核实/未验 |

---

## 5. 测试计划

**单元（jest，纯函数，对齐 §8.1）**

- `parseCanvasDocument`/`serializeCanvasDocument` 往返无损（含未知字段保留）；`assertWritableDocument` 对重复 id、悬空边端点、非法 type、非有限坐标的拒绝。
- `layoutGrid` 黄金值断言：n=1/3/4/5/7/20；分组布局组内不重叠、组间不重叠（几何断言程序化验证"节点不重叠"）。
- 重名追加序号逻辑；生成内容构建的确定性（同输入两次构建序列化相等）。
- 节点改写解析：严格 parser 复用的一致性、Mermaid 单块约束、`findWriteToolCalls` 命中即弃。

**契约（跨模块，对齐 §8.2）**

- 生成失败矩阵：`vault.create` 抛错 / 校验抛错 / 目标目录不存在 → 磁盘零新增文件（临时目录真实文件系统断言）。
- R-B3 覆盖：生成的新 `.canvas` 与文件节点写回均可从回退入口撤销（新建文件进回收站语义）。
- aux 改写期间 vault 快照零变化（改写只读，写只发生在确认后）。
- 关闭态回归：不启用功能时无任何命令/监听器注册（对齐 R-C3"关闭零开销"精神）。

**真 CLI 端到端（真实模型，四后端）**

- AI 拆分：3 篇真实笔记 → 提案可解析、来源归属正确、无写类工具调用（审计通过）。
- 节点改写：真实文本节点 → "改写为 Mermaid 代码块" → 输出可解析、单块、内容对应原节点。

**实机（Obsidian，主智能体执行）**

- 运行时确认门逐项过 → 验收 1/2 全流程（选中 3 篇 → 生成 → Obsidian 原生打开编辑正常）。
- 验收 3 全流程：选节点 → AI 改写 → 确认 → 写回 → `Ctrl+Z` 行为实测记录（可用/不可用如实回填）。
- 验收 4：断电式失败演练（生成中取消）+ 损坏 `.canvas` 拒绝打开本插件功能。
- 截图存档 `artifacts/opencodian/flowtext-parity/`。

---

## 6. 验收标准映射（需求 R-C5 验收 1–4 逐条）

| # | 验收标准 | 设计如何使其可验证 |
|---|---|---|
| 1 | 选中 3 篇笔记 → 生成一个 `.canvas`，含 3 个及以上节点，节点不重叠 | picker/主题组/多选三来源（§3.3）；`layoutGrid` 几何不重叠为单测黄金断言；实机复核 |
| 2 | 生成的 `.canvas` 能被 Obsidian 正常打开与编辑（结构合法） | `assertWritableDocument` 写前强校验 + 实机原生打开编辑；schema 常量与库内真实文件对齐（§2-3） |
| 3 | （可行性通过）选中节点 → AI 改写 → 确认后写回，Ctrl+Z 可撤销 | §7 给出可行性结论与运行时确认门；写回经预览确认；`Ctrl+Z` 实测如实记录，保底撤销 = R-B3 回退（不可用则明示，不伪装） |
| 4 | 生成失败不留下损坏的 `.canvas` 文件 | 内存构建 + 双重校验 + 单次 `vault.create` + 异常回收（§3.3）；契约测试用真实临时目录断言"失败即零文件" |

---

## 7. 可行性验证结论（节点级 AI 编辑的关键未知项）

**探测约束（如实声明）**：测试库当前**核心 Canvas 插件处于禁用态**（实测 `app.internalPlugins.getPluginById('canvas').enabled === false`，`viewRegistry.viewByType` 无 `canvas` 类型，打开 `.canvas` 落空视图）。启用插件会持久化改设置，超出本次只读探测红线，故**无法进行运行时活体探测**。以下结论来自三个替代证据源，置信度逐级标注。

**证据 1 —— `.canvas` 文件格式（实测 ✅）**：库内 `SynthNote/Canvas/Runtime.canvas` 实读为 `{"nodes":[{id,type:"file",file,x,y,width,height}],"edges":[]}`，与需求文档"JSON（nodes/edges）可直读直写"的判断一致。**生成功能的可行性因此是完全确定的**（纯 vault API，零内部依赖）。

**证据 2 —— 桌面包静态核实（✅，静态）**：对安装包 `obsidian-1.13.7.asar` 的 `app.js` 做只读解包检索（临时解包至 `/tmp`，已清理），逐项确认以下结构与代码确实存在：

- `view.canvas`：视图构造中 `.canvas=new <Canvas类>`，Canvas 实例自带 scope 挂在 app scope。
- 状态容器：`this.nodes`（Map 语义，`getData` 中 `Array.from(this.nodes.values())`）、`this.edges=new Map`、`this.selection=new Set`、`this.dirty=new Set`、`isDragging`。
- 数据接口：`canvas.getData()`（组装 `{nodes,edges}`）；各节点子类 `getData` 产出 `type:"file"/"text"/"link"/"group"`；`canvas.setData(e)` 消费 `{nodes:[...]}` 全量回灌；`canvas.requestSave()` 实现 `dirty=true` + 去抖保存。
- UI 挂点：浮动选择菜单 `canvas-menu-container` → `canvas-menu`；节点 DOM `canvas-node` / `canvas-node-content` / `canvas-node-interaction-layer` / `canvas-node-resizer[data-resize]`；`canvas.onSelectionContextMenu`；`canvasEl` 与边线 SVG 容器；`canvas.requestFrame`。
- 文件节点携带 `filePath`（`this.filePath=e.path`）。

这些正是社区 Canvas 生态插件（Advanced Canvas 等）长期依赖的同一批接缝，与静态核实互相印证。

**未验项（⏳，实施期运行时确认门逐项闭环）**

- U1 `canvas.selection` 在真实多选/单选时的成员类型与稳定性。
- U2 浮动菜单 DOM 追加按钮的实际渲染与命中（静态确认容器存在，未活体点击）。
- U3 `Ctrl+Z` 对 `setData` 写回的原生 undo 覆盖（决定验收 3 的撤销通道是双是单）。
- U4 选中变化的推送事件名（bundle 中未见 `"selection-changed"` 字面量）——设计已规避依赖：本方案在**用户动作时同步读** `selection`，不需要事件推送。

**结论**

- **Canvas 生成：完全可行**，零技术未知，可先行实施。
- **节点级 AI 编辑：有条件可行**。API 面经静态核实与社区实践双重印证，风险集中在运行时行为而非存在性；设计以运行时确认门（§3.4）兜底——门不过则功能不注册、如实说明，命令降级（B/C 级）覆盖 selection 读取失效场景，结果回传（D 级）恒可用。与 R-C4 三期同等诚实标准：验证不过就按降级交付，不伪装。

---

## 8. 开放问题（需裁决）

| # | 问题 | 建议 | 理由 |
|---|---|---|---|
| E1 | 生成的默认节点模式 | **文件引用节点为默认**，AI 拆分为显式二级选项 | 零 token、零内容拷贝、改名自动跟随；拆分按需付费且失败可回退 |
| E2 | 验收 3 的 `Ctrl+Z` 若原生 undo 不覆盖 `setData` | **保底撤销 = R-B3 回退**，并在验收记录中如实标注单通道 | 后端/视图无关的撤销语义是仓库既定方向（§10-Q4 同理）；不因验收措辞伪造 undo |
| E3 | "选中 3 篇笔记"的入口形态 | **picker 多选为主**，文件浏览器多选内部 API 做 feature-detect 增强，R-B2 主题组作为来源之一 | 文件浏览器多选态属未公开内部 API（与 §7 同类风险），不可作为唯一入口 |
| E4 | 文件节点的 AI 改写范围 | **整篇笔记为改写对象**（预览强确认），不做"仅节点摘录"的部分改写 | 部分改写需要锚点回写，引入对齐类失败模式；整篇写走既有"单次闭包 + 快照 + 脏检查"语义最稳 |
