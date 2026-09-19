# FlowText 功能对齐需求文档

- 状态：**待审查（Draft v1）**
- 日期：2026-09-17
- 对标基准：B 站「模块化 OB」余先生 FlowText 8 期功能全解（2026-09-17 转录整理）
- 前置文档：`docs/requirements/inline-edit.md`（行内编辑既有设计，本文档批次 A 是它的后续迭代）；`docs/requirements/obsidian-linkage.md`（上下文链路与"不自动注入"原则）
- 定位：这是一份**能力驱动的需求清单**。FlowText 只作对标基准，**不代表复制其实现路径**——凡与本仓库既有硬约束（只读辅助契约、唯一写路径、fail-closed）冲突的地方，一律以本仓库约束为准。

> **维护方式**：每条需求带唯一编号（`R-A1`…）。实现落地后回填该条目的「状态」列（`TODO` → `DONE` / `PARTIAL` / `WONTFIX`），并附证据来源。不重写结构、不新增叙事性散文。

---

## 1. 目标与范围

### 1.1 目标

让 OpenCodian 在**笔记内写作**与**仓库级知识操作**两个面上达到 FlowText 的能力覆盖，同时保留 OpenCodian 已有的结构优势（四后端、多标签并发、持久记忆、完整 coding agent）。

### 1.2 判定基线

| 维度 | OpenCodian 现状 | 结论 |
|---|---|---|
| 侧边栏 Agent 能力 | 四后端 + 多标签并发 + MCP/Skills/Agents + 后台任务 + 持久记忆 | **已远超 FlowText**，不在本次补齐范围 |
| 笔记内写作（行内编辑） | 引擎完整（三形态 + 词级 diff + 脏检查 + 澄清循环 + 附加上下文），但交互入口与生成体验缺项 | **批次 A 补齐** |
| Obsidian 领域能力 | 无 PDF / Canvas / 原生工具 / 自动内链 / 回退 | **批次 B 补齐** |
| 检索与生成 | 无整库检索 / 文生图 / 补全 | **批次 C 补齐** |

### 1.3 范围外

见 §11。

---

## 2. 能力对照总表与批次划分

优先级判据：**先补齐「体感缺口」（已有引擎的入口与生成体验），再补领域能力，最后做检索与生成类大工程。**

| 批次 | 编号 | 需求 | FlowText 对应 | 优先级 | 状态 |
|---|---|---|---|---|---|
| A | R-A1 | 笔记内 `@` 唤起与默认热键 | `@` 呼出悬浮窗 | P0 | DONE |
| A | R-A2 | `#` 预设提示词菜单 | `#` 快速调出预设提示词 | P0 | DONE |
| A | R-A3 | 流式 diff 预览 | 流式续写 | P0 | PARTIAL |
| A | R-A4 | 行内面板贴图（OCR / 手写 → LaTeX） | 截图转公式 | P0 | DONE |
| A | R-A5 | 多片段并行编辑 | 多片段并行续写/修改 | P1 | DONE |
| A | R-A6 | 全文修改模式 | 点击机器人图标改全篇 | P1 | DONE |
| A | R-A7 | 文件夹 / 多选上下文 + 拖拽 | 选择整个文件夹、内链嵌入 | P1 | DONE |
| B | R-B1 | 生成内容自动内链 | 自动建立指向参考笔记标题的内链 | P1 | PARTIAL |
| B | R-B2 | 主题关联（上下文组） | 勾选关联主题作参考资料 | P1 | DONE |
| B | R-B3 | 编辑回退（单文件 / 整轮） | 单文件回退、一键回退全部 | P1 | DONE |
| B | R-B4 | Obsidian 原生工具 | 基于官方 CLI 的 Agent | P1 | DONE |
| B | R-B5 | 批量整理（归拢笔记 / 批量改属性） | 批量操作与整理 | P2 | DONE |
| C | R-C1 | 整库语义检索（整库感知） | 整库感知模式 | P2 | DONE |
| C | R-C2 | 文生图 | 文本生成图片 | P2 | DONE |
| C | R-C3 | Alt 一键补全（ghost text） | Cursor 风格自动补全 | P2 | PARTIAL |
| C | R-C4 | PDF 读取 / 索引 / 内文交互 | 超大型 PDF 本地索引 | P2 | PARTIAL |
| C | R-C5 | Canvas 生成与节点级 AI | Canvas 白板支持 | P2 | DONE |
| C | R-C6 | 外部接口（远程驱动） | DeepSeek Harness 接口 | P2 | DONE |

已对齐、本次不动的部分（仅登记，避免重复劳动）：行内三形态引擎、词级 diff 与接受/拒绝、脏检查、澄清循环、模型与思考强度选择、附加上下文（路径制）、多供应商与自定义 OpenAI 兼容端点、思考过程展示、图片输入（聊天侧 vision）、斜杠命令（等价于 FlowText 的预设提示词，但仅存在于聊天侧）。

---

## 3. 批次 A：行内编辑 v2（详细需求）

批次 A 全部改动落在 `src/features/inline-edit/**` 与 `src/core/agents/backend/AgentAuxQueryCapability.ts`，**不得削弱既有只读契约**。

### R-A1 笔记内 `@` 唤起与默认热键

**目标**：FlowText 以 `@` 在笔记任意位置呼出对话。OpenCodian 的光标形态引擎已具备，缺的是入口。

**现状证据**

- `src/main.ts:789-803`：`inline-edit` 命令注册无 `hotkeys` 数组，默认不绑定任何按键。
- `src/features/inline-edit/InlineEditSelectionAffordance.ts:76-80`：悬浮按钮要求非空选区，光标态不出现。
- `src/features/inline-edit/InlineEditController.ts:206-218`：`cursor-inline` / `cursor-inbetween` 判定与前后文捕获**已实现**。

**需求**

1. 新增可选输入触发器：在编辑器内满足「位于行首 **或** 前一字符为空白」时键入 `@`，在该位置打开行内编辑面板，且 `@` 本身**不得写入文档**。
2. `@` 触发器由 `inlineEditTriggerAt`（默认 `false`）控制，理由见 §10 Q1。
3. 提升命令可发现性：设置页展示「当前未绑定快捷键」并提供跳转到 Obsidian 热键设置的入口。
4. 既有三个入口（命令、右键菜单、选区悬浮按钮）行为不变。

**技术约束**

- 拦截 `@` 必须走 CM6 `EditorView.inputHandler`（或等价的 DOM 级 `beforeinput` 处理）；`keymap` 不可靠，因为 `@` 是组合键键入且受键盘布局影响。
- `inputHandler` 返回 `true` 表示已消费该输入，此时必须自行决定 `@` 是否进入文档。
- IME 组合态（`view.composing` / `event.isComposing`）一律不拦截。仓库既有惯例：见 `InlineEditController.ts:483-499` 的 `isComposing` 保护。
- 面板定位复用既有 `InlineEditInputOverlay.show(anchor.from)`，不得新造定位逻辑。

**验收标准**

1. 空行行首键入 `@` → 面板出现在光标处，文档中不出现 `@`。
2. 在 `user@example.com` 中间键入 `@`（非行首且前一字符非空白）→ 正常键入，不触发。
3. `inlineEditTriggerAt` 关闭时行为与当前版本完全一致。
4. 中文输入法组合态下键入 `@` 不触发。
5. Reading mode 或无文件关联的编辑器上不注册 handler。

**风险**：与其他 Obsidian 插件的 `@` 用法冲突（§10 Q1）。

---

### R-A2 `#` 预设提示词菜单

**目标**：FlowText 用 `#` 快速调出插件预设提示词。OpenCodian 的斜杠命令只服务于聊天 composer，行内面板没有对应物。

**现状证据**

- `src/features/inline-edit/InlineEditInputOverlay.ts:267-353`：输入面板只有多行 textarea、提交/关闭按钮与模型/思考强度/上下文 chip，无触发字符、无菜单、无预设列表。
- 聊天侧已有可复用原语：`SlashCommandMenuCoordinator` / `slashCommandMenuFilter` / `slashCommandMenuRenderer`（`src/features/chat/services/`）。

**需求**

1. 行内面板的指令输入区内，键入 `#`（位于输入开头或空白之后）弹出预设提示词菜单。
2. 菜单支持键盘全流程：上下移动、Enter 选定、Esc 关闭；也支持鼠标点击与滚动。
3. 选定预设**填入输入框**，**不自动提交**（用户仍需确认，与 FlowText 的"调出后可再编辑"一致，且更安全）。
4. 预设来源分两层：
   - 内置默认集（建议：扩展内容与例子、精简表达、翻译为指定语言、总结为 Markdown 表格、润色语气、修正错别字）；
   - 用户自定义集（设置页可增删改，含标签与提示词正文）。
5. 预设与当前形态（选区 / 光标 / 全文）无关，不做形态过滤。

**技术约束**

- 菜单渲染复用 `ComposerPopoverFrame` / `choicesToMenuItems` 一类既有面板原语，不新造浮层组件（`InlineEditInputOverlay.ts:629` 已有 `choicesToMenuItems`）。
- `#` 是常见 markdown 字符（标题、标签）；触发条件必须严格限定为「输入开头或前一字符为空白」，且当 `#` 后紧跟非空字符时不再作为触发器（与 Obsidian 标签输入兼容）。
- 输入法组合态不触发菜单。
- 菜单开启期间的 Enter/Esc 必须优先被菜单消费，不得冒泡到「提交指令」逻辑（`InlineEditInputOverlay.ts:291-299` 现有的 Enter 提交路径）。

**验收标准**

1. 输入框为空时键入 `#` → 菜单出现，列出内置预设。
2. 键入 `#扩展` → 菜单过滤到匹配项。
3. Enter 选定 → 预设正文进入输入框，菜单关闭，**未发送任何请求**。
4. Esc 关闭菜单且输入框内容不变。
5. `#标签` 形式的输入（`#` 后紧跟文字且已在菜单关闭态）不误触发。
6. 自定义预设为空集时，菜单仍显示内置项。

---

### R-A3 流式 diff 预览

**目标**：FlowText 在光标处流式续写。OpenCodian 现在等整轮生成结束再渲染预览，长文生成期间用户看不到任何进展。

**现状证据**

- `src/core/agents/backend/AgentAuxQueryCapability.ts:37-42`：`AuxQueryTurnRequest.onTextChunk` 流式接缝**已存在**，且四个后端均已发射。
- `src/features/inline-edit/InlineEditService.ts:57-68`：`submit()` 构造请求时**未传** `onTextChunk`。
- `src/features/inline-edit/InlineEditController.ts:368-383`：预览一次性构建，`busy: false`。
- `docs/requirements/inline-edit.md:451`：既有文档把「流式 diff 预览」列为明确不做项——本条即该迭代项。

**需求**

1. 生成期间在编辑器内**实时**渲染 diff 预览，随 token 到达增量更新。
2. 首字节到达后应尽快出现可见预览（目标：收到前 8 个字符内；上限 500ms）。
3. 流式阶段结束后，最终结果必须与一次性路径**逐字节一致**（同一解析器、同一归一化）。
4. 流式阶段出现协议违规（多标签、未闭合、超限）时，清除预览并回到错误态，**不得部分应用**。

**技术约束（本条的核心难点）**

XML 标签协议在流式下有固有歧义：闭合标签到达前无法确定内容是否合法。必须引入**渐进解析**，且不得放松最终校验：

- 流式阶段：一旦识别到 `<replacement>` 或 `<insertion>` 开标签，即确定模式（replacement / insertion）并累积标签体，边收边渲染；开标签到达前不渲染（显示 spinner 即可）。
- 收尾阶段：必须仍走 `parseInlineEditResponse()`（`InlineEditPrompt.ts:267-307`）做**严格校验**——即流式解析只用于渲染，**不作为落盘依据**。
- 两者不一致时（例如流式已渲染但严格解析报 `multiple-tags`）以严格解析为准：清预览 + 报错。
- 渲染节流：装饰更新必须按 rAF 合批，**禁止每个 chunk 都 dispatch**；`InlineEditWidgets` 的 `eq()` 需按累积文本比较，避免整块重建（`InlineEditWidgets.ts:122-126`）。
- 澄清循环（无标签纯文本回复）在流式下表现为"边收边显示在输入框上方"，不进入预览通道。

**验收标准**

1. 生成一段 200 字的续写：预览在首字节后 500ms 内出现，且随生成推进逐步增长。
2. 最终接受后的文档内容与关闭流式时（对照实现）完全一致。
3. 构造一个返回两个 `<replacement>` 标签的响应：流式期间可能已渲染，最终必须清除预览并报"多个协议标签"。
4. 构造一个未闭合标签响应：清除预览并报错，无任何写入。
5. 1000 次 chunk 的生成过程不产生可见卡顿（对比一次性路径的帧率）。
6. 流式期间按 Esc 立即取消，且无残留装饰。

**风险**：流式期间用户能看到的中间态可能被误认为最终结果 → 中间态必须带明确的"生成中"视觉标识（`InlineEditPreviewPayload.busy` 已具备，需在流式下真正置 `true`）。

---

### R-A4 行内面板贴图（OCR / 手写 → LaTeX）

**目标**：FlowText 的截图/手写转 LaTeX 是其高频卖点。聊天侧 OpenCodian 已能做（图片 + vision 后端），但行内面板不能贴图，因此"在笔记里直接得到公式"这条链路是断的。

**现状证据**

- 聊天侧已完整支持图片：粘贴 `src/features/chat/services/ComposerInputShellCoordinator.ts:310-324`、拖拽 `:1543-1611`、类型白名单 jpeg/png/gif/webp `:1469-1475`。
- 各后端图片传输实现均已存在：OpenCode `OpenCodeContextPartSerializer.ts:32-39`、Claude `ClaudeCodeQueue.ts:14,29,132`、Codex `CodexAdapter.ts:1953,1986-1997`、Pi `PiStreamMapper.ts:43`。
- 行内面板只支持附加上下文笔记，上限 5 篇：`InlineEditController.ts:303-329`、`InlineEditPrompt.ts:38`。
- 能力层请求体**只有文本**：`AgentAuxQueryCapability.ts:37-42`。

**需求**

1. 行内面板支持粘贴与拖拽图片，作为**本次请求的输入**。
2. 图片**不得落盘到 vault**；请求结束后无残留。
3. 图片附带的请求走同一协议：模型输出 `<insertion>` / `<replacement>`，标签体即要插入的文本（对 OCR 场景即 LaTeX）。
4. 系统提示词增加图片语义：附带图片时按内容输出纯文本结果；数学公式默认输出 LaTeX 且按锚点形态选择定界符（行间 `$$…$$`，行内 `$…$`）。
5. 面板显示图片 chip（缩略图 + 移除），上限 1 张（本期）。

**技术约束**

- 能力层接口扩展（新增字段，不改变既有字段语义）：

```ts
export interface AuxQueryImageAttachment {
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  /** Base64 负载，不含 data-URL 前缀。 */
  readonly data: string;
}

export interface AuxQueryTurnRequest {
  readonly prompt: string;
  readonly signal?: AbortSignal;
  readonly onTextChunk?: (accumulatedText: string) => void;
  readonly images?: readonly AuxQueryImageAttachment[];   // 新增
}
```

- **四个后端全部实现图片传输是硬指标**，复用聊天侧既有实现，不重写第二套。
- Codex 侧的 `local_image` 需要临时文件：**必须写在系统临时目录，不得写在 vault 内**；`dispose()` 必须清理。这是"query 前后 vault 文件系统快照无变化"审计（`docs/requirements/inline-edit.md` §5.5）能够继续通过的硬前提。
- 图片大小上限（建议单张 ≤ 4MB base64 解码前）与类型白名单沿用聊天侧常量。
- 图片不是工具调用，因此**不触碰** `AUX_DENIED_CAPABILITIES`（`AgentAuxQueryCapability.ts:129-137`）；但图片附件**不得**成为放宽只读约束的理由。

**验收标准**

1. 行内面板粘贴一张手写公式截图 → 生成 → diff 显示 LaTeX → 接受后插入文档。
2. 四个后端逐一通过。
3. 请求前后对 vault 做文件系统快照比对：**无变化**（含 Codex 临时文件场景）。
4. 在光标行间触发并插入 LaTeX 时，定界符为 `$$…$$`；行内触发为 `$…$`。
5. 超过大小上限的图片被拒绝并提示，不静默丢弃。
6. 不支持图片的后端（若出现）显示明确的能力缺失提示，不静默降级为无图请求。

---

### R-A5 多片段并行编辑

**目标**：FlowText 允许在同一笔记中同时续写/修改多个片段。OpenCodian 目前是全局单例，第二个调用会杀掉第一个。

**现状证据**

- `src/main.ts:160-161`：注释明确"同时只允许一个 inline edit"。
- `src/features/inline-edit/InlineEditController.ts:109-111`：`open()` 开头即 `if (this.active) this.reject()`。
- `src/features/inline-edit/InlineEditWidgets.ts:49-75`：单个 `StateField<DecorationSet>`，且每次 `Decoration.set([...])` **整体替换**装饰集，天然只容纳一个预览。
- `src/features/inline-edit/InlineEditWidgets.ts:104-109`：`readInlineEditRange()` 固定读取装饰集的**第一个** range。

**需求**

1. 同一 `EditorView` 内允许多个并行的行内编辑，每个拥有独立锚点、独立会话、独立 diff。
2. 并发上限由 `inlineEditMaxConcurrentEdits`（默认 `3`）控制；超限时提示用户先处理已有编辑，**不静默替换**。
3. 每个编辑的接受/拒绝只影响自己，不影响其他编辑的锚点与状态。
4. 键盘操作（Enter 接受 / Esc 拒绝）只作用于**当前聚焦的那个**编辑。

**技术约束**

- 装饰层改造：`InlineEditWidgets` 的状态从"单个 payload"改为"按 `editId` 键控的 payload 集合"，效果拆为 `upsertPreview(payload)` / `removePreview(editId)` / `clearAllPreviews`；`readInlineEditRange(state, editId)` 按 id 取范围。
  - 注意：`InlineEditWidgets.ts:59-69` 对 insertion 用 `block: true` widget、对 replacement 用**内联** replace（注释解释了 block replace 会被 CM 扩展到整行，破坏脏检查）——多片段改造**必须保留这两条语义**，否则脏检查与写入范围会错。
- 控制器改造：`active: ActiveEdit | null` 改为按 `EditorView` 分桶的 `Map`；`close()` 需要 `close(editId)` 语义，同时保留"关闭该编辑器全部编辑"的路径（编辑器卸载、vault 切换时）。
- **脏检查语义保持不变且天然安全**：每个编辑的脏检查比对的是**自己范围**的文本快照（`InlineEditService.canApplyEdit`，`InlineEditService.ts:195-197`）。接受编辑 A 会改变文档，编辑 B 的范围经 `map(tr.changes)` 跟随映射；只要 A 的写入未触及 B 的范围，B 的快照仍然相等，脏检查正确通过——这一点必须在测试中显式覆盖。
- 成本提示：每个并行编辑 = 一个独立 `AuxQuerySession`（独立后端进程/线程/会话）。设置项说明中必须写明"并发编辑会同时消耗多个模型会话"，并在 UI 上限制上限。
- 焦点归属：面板获得焦点时把自己登记为"当前编辑"，键盘处理器据此分派，不得使用全局单例判断。

**验收标准**

1. 在同一笔记开两个编辑（一个选区改写、一个光标插入）→ 两个面板同时存在、互不干扰。
2. 分别 accept：先 accept 的写入后，后者的 diff 预览位置正确跟随（不漂移），且仍可正常 accept。
3. 在编辑 A 的范围内手动改动 → A 的 accept 被拒绝并提示"生成期间笔记已被修改"；**编辑 B 不受影响，仍可 accept**。
4. 超过 `inlineEditMaxConcurrentEdits` 时，第 N+1 次唤起给出提示且**不销毁已有编辑**。
5. 关闭笔记 / 切换文件时，所有编辑的会话全部 `dispose()`，无残留装饰与原生会话。
6. 键盘 Enter/Esc 只作用于聚焦的编辑（用两个编辑交叉验证）。

---

### R-A6 全文修改模式

**目标**：FlowText 的第三种模式（改全篇）。OpenCodian 的请求形态只有选区与光标两类，且长度上限低到无法容纳整篇。

**现状证据**

- `src/features/inline-edit/InlineEditPrompt.ts:41`：`InlineEditRequestKind = 'selection' | 'cursor-inline' | 'cursor-inbetween'`，无全文形态。
- `src/features/inline-edit/InlineEditPrompt.ts:24-30`：选区上限 20,000 字符、周边上下文 40,000 字符。
- `src/features/inline-edit/InlineEditController.ts:514-543`：`buildRequest()` 只构造上述两类请求。

**需求**

1. 新增第三种请求形态：整篇笔记内容作为待改写对象。
2. 入口：行内面板顶部的「整篇」模式切换（与选区/光标互斥），以及独立命令 `inline-edit-document`。
3. 输出契约**复用 `<replacement>`**（语义为"替换本次请求指定的文本范围"），因此解析器零改动；仅新增请求侧的文档块。
4. 落盘仍为**单次 `editor.replaceRange`** 覆盖整篇，保证 Obsidian 单步撤销可用。
5. 整篇替换在接受前必须**二次确认**（因为整篇场景几乎必然触发 diff 降级，审阅体验弱于选区场景）。

**技术约束**

- 请求块建议形态（与既有块风格一致）：

```
<editor_document path="笔记路径" lines="1-240">
整篇正文
</editor_document>
```

- 新增上限常量 `INLINE_EDIT_MAX_DOCUMENT_CHARS`（建议 200,000）。超限**拒绝并提示**，**不做分块**——分块会破坏整篇一致性，且模型对各块之间的衔接无法保证。
- 正文包含字面量 `</editor_document>` 或 `</replacement>` 时沿用 fail-closed 拒绝（`InlineEditPrompt.ts:188-190, 203-207` 的既有策略），不发明新转义协议。
- diff 性能：整篇必然超过既有词级 LCS 预算（`docs/requirements/inline-edit.md` §7.7 的 token 乘积 ≤ 4×10⁶），**必须走既有的整段 before/after 降级视图**，不得强行计算 diff 造成卡死。降级视图必须明确标注"内容过大，仅显示前后对照"。
- 脏检查必须覆盖整篇范围快照（一致于既有实现）。
- 提示词需明确：整篇模式下允许调整结构（标题层级、段落顺序），但不得丢弃既有信息，除非用户指令要求。

**验收标准**

1. 打开一篇 >20,000 字符的笔记，通过命令进入整篇模式，成功发起并应用修改。
2. 超过 `INLINE_EDIT_MAX_DOCUMENT_CHARS` 的笔记被拒绝并给出明确提示。
3. 整篇修改的 diff 以整段对照形式呈现，且标注降级原因。
4. 接受后 Ctrl+Z **一步**恢复到修改前全文。
5. 生成期间用户改动笔记 → 接受被拒绝，无写入。
6. 整篇替换前出现二次确认；取消则无任何写入。

---

### R-A7 文件夹 / 多选上下文与拖拽

**目标**：FlowText 支持键盘选择仓库文件、连续插入多篇、以及选择整个文件夹。OpenCodian 的 picker 一次只能选一个文件，拖拽只认图片。

**现状证据**

- `src/features/chat/ui/ContextFilePickerModal.ts:20-28, 200-226`：过滤扩展名 + 搜索，返回**单个** `TFile`；渲染上限 200 条。
- `src/features/chat/services/ContextFileCatalogIndex.ts:116-133`：`createContextFileEntry(file: TFile)` 只接受文件，**文件夹从未进入模型**。
- `src/features/chat/services/ComposerInputShellCoordinator.ts:1593-1611`：拖拽处理经 `filterImageFiles` 过滤，非图片一律忽略。
- `src/features/inline-edit/InlineEditController.ts:303-329`：行内 picker 亦为单选 + 上限 5。

**需求**

1. 文件选择器支持**多选**（行内面板与聊天 composer 一致）。
2. 文件选择器与拖拽均支持**文件夹**条目。
3. 行内面板与聊天 composer 的上下文均支持拖入：vault 内的文本文件与文件夹转为上下文 chip；vault 外部的文件维持现状（不处理，图片除外）。
4. 提示词中的 `<attached_context>` 块需区分文件与目录语义，系统提示词说明"目录条目表示该目录下的笔记是参考资料，按需读取，**不要全量读取**"。

**技术约束**

- `InlineEditHost.listContextFiles()`（`InlineEditHost.ts:52-56`）与 `InlineEditContextFile`（`InlineEditTypes.ts:59-63`）需扩展条目类型区分文件/目录。
- 条数上限沿用 `INLINE_EDIT_MAX_ATTACHED_NOTES`（`InlineEditPrompt.ts:38`）语义：**每个条目（文件或目录）各计一个**，目录不展开计数——展开计数会让上限失去意义。目录内实际读取量由只读工具与提示词约束控制。
- 路径校验沿用既有规则：长度 ≤ 500 字符、不含 `<>`（`InlineEditPrompt.ts:222-232`），目录路径同样适用。
- 拖拽解析必须走 `app.vault.getAbstractFileByPath()` 并校验 `instanceof TFile | TFolder`，**不得**直接接受任意路径字符串（避免把 vault 外路径送进上下文）。

**验收标准**

1. 行内 picker 中连续勾选 3 篇笔记 → 生成 3 个 chip，请求中出现 3 条路径。
2. 拖入一个文件夹 → 出现目录 chip；模型能够读到其中笔记内容（在附加上下文引用场景中验证）。
3. 拖入 vault 外的普通文件 → 不产生 chip，也无报错崩溃。
4. 附件总数超过上限时给出提示，且不静默截断。
5. 目录路径含特殊字符时不破坏协议块（沿用 fail-closed）。

---

## 4. 批次 B：Obsidian 领域能力

### R-B1 生成内容自动内链

**目标**：FlowText 在生成内容引用参考笔记观点时自动建立指向该笔记（可到标题级）的内链，并把"有据可依"作为对抗幻觉的手段。OpenCodian 完全没有链接生成逻辑。

**现状证据**

- `src/utils/markdown/fileLink.ts:5-11, 40-93`：只有 wikilink 的**识别与渲染**，以及 `imageEmbed.ts` 的图片嵌入。
- `src/features/inline-edit/InlineEditPrompt.ts:115`：系统提示词只要求"保持既有链接不被破坏"。
- `src/core/memory/memoryProtocol.ts:33,36`：仅提示词层要求模型自己写 `[[name]]`，无任何后处理强制。

**需求**

1. 当本次请求的**参考笔记集合**非空时（来源：附加上下文 + 主题关联 R-B2），生成结果中引用参考笔记观点之处应产生指向该笔记对应标题的内链。
2. 链接目标必须**经验证存在**：标题必须真实存在于目标笔记的 `CachedMetadata.headings` 中；否则不插入链接。这是与 FlowText 的关键质量差异——宁可不链，不产生死链。
3. 功能默认关闭（`autoInternalLinkEnabled`，默认 `false`），因为它会改写用户可见文本。
4. 链接语法遵循 vault 配置（`[[路径#标题|显示文本]]` / `[[路径#标题]]`），显示文本保持生成文本的原文措辞，不替换用户看到的词。

**技术约束**

- 实现放在**后处理层**（确定性、可单测），不放在提示词层。提示词可作为辅助（要求模型保留可识别措辞），但**不得**作为唯一机制。
- 匹配算法需处理：标题层级归一化、大小写与全半角、代码块与行内代码内**不**插链接、已有链接内不重复插链接。
- 误报控制：仅当参考笔记的标题长度 ≥ 阈值（建议 2 个字符起，且是 CJK 或 ≥ 4 个西文词）且出现精确匹配时才插入；通用词（如"总结""注意"）需排除。排除表需可配置。
- 内链插入发生**在 diff 生成之前**，因此用户能在 diff 中看到并拒绝这些链接——不得在落盘时静默改写。
- 与 R-A6 全文模式叠加时，同样在后处理层完成。

**验收标准**

1. 参考笔记含 `## 注意力机制`，生成文本出现"注意力机制" → 结果包含指向该标题的内链。
2. 生成文本出现参考笔记中**不存在**的标题词 → **不插链接**（无死链）。
3. 代码块内出现该词 → 不插链接。
4. 开关关闭时，生成结果与当前实现逐字节一致（回归）。
5. diff 预览中能清楚看到新增的链接（属于可拒绝内容）。

---

### R-B2 主题关联（上下文组）

**目标**：FlowText 允许把新建笔记"关联到一个主题"（20+ 篇笔记），这些笔记作为参考资料；这是 R-C1 整库检索之外的一个**显式、可控**的上下文来源。

**现状证据**

- 附加上下文是一次性手选（`InlineEditController.ts:303-329`），上限 5 篇，无持久化分组。
- 设置中无任何"上下文组 / 主题"概念。

**需求**

1. 设置页支持定义「上下文组」：名称 + 有序条目列表（文件或目录）。
2. 行内面板与聊天 composer 提供「附加主题」入口，一键把整组加入本次上下文，效果等同手工逐个附加。
3. 组内条目数可大于单次上限；一键附加时若超出上限，按顺序取前 N 条并**明确提示被省略的条数**（不静默截断）。
4. 组可跨笔记、跨会话复用（持久化在插件设置中）。

**技术约束**

- 复用 R-A7 的上下文 chip 机制，不新造 UI 概念。
- 组定义存在插件设置里（`contextGroups`），路径变更（笔记被移动/删除）时需在附加时校验存在性，缺失项跳过并提示。
- 本需求**不涉及**自动匹配（那是 R-C1），只说"用户显式定义一个集合并一键附加"。

**验收标准**

1. 定义一个含 8 篇笔记的主题 → 一键附加 → 出现 8 个 chip → 请求包含 8 条路径。
2. 主题含已删除笔记 → 附加时跳过并提示缺失项，不报错。
3. 跨重启后主题仍然存在且可用。

---

### R-B3 编辑回退（单文件 / 整轮）

**目标**：FlowText 的 Agent 支持单文件回退与"一键回退所有编辑过的内容"。OpenCodian 目前只有 OpenCode 的会话级 rewind，且没有任何插件侧文件快照。

**现状证据**

- `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts:373-450, 452-486`：`revertSession()` / `unrevertSession()` **仅 OpenCode**（`AgentCapability.Branching` 只有 `OpenCodeAdapter.ts:136` 声明）。
- `src/features/chat/ui/ModifiedFilesSidebar.ts:1-6`：明确声明"不请求 Git 状态、不渲染 patch 内容"，点击仅打开文件——**纯只读**。
- `docs/requirements/turn-change-records-and-session-sidebar.md:18-20, 52-54`：Turn Change Record 是**不可变证据**，明确不是回退机制。
- Claude 的 file checkpointing 被标注 `@experimental` 且 `query()` 模式下从不创建检查点（`src/core/types/settings.ts:331`，上游 bug #236）。

**需求**

1. 提供**后端无关**的文件级回退：不依赖任何后端的 revert 能力。
2. 单文件回退：把某个被本轮（或本会话）修改的文件恢复到最后一次修改前的内容。
3. 整轮回退：一键把本轮所有被修改的文件恢复到本轮前。
4. 本轮**新建**的文件，回退时移入 Obsidian 回收站（`vault.trash`），**不直接物理删除**。
5. 回退操作本身必须可再撤销（回退前的当前内容需保留，以便误回退后恢复）。
6. 侧栏提供入口，且与被修改文件列表对应。

**技术约束**

- 快照范围必须先定案（§10 Q4）。硬约束：
  - 快照只能覆盖**文本文件**（Markdown），二进制资产不在本期范围；
  - 单文件快照大小需有上限，超限文件明确标注"未纳入回退"；
  - 预快照耗时必须有预算（建议 ≤ 200ms/轮，超预算则退化为"仅快照 agent 声明涉及的文件"）；
  - 快照存储位置在插件数据目录（例如 `.opencodian/checkpoints/`），使用内容寻址去重，避免重复存储整篇正文；
  - 快照必须有保留上限（条数 / 字节数），超限淘汰最旧记录。
- 回退写回走 `vault.process()` / `vault.modify()`（保持原子性）；**不得**绕过 vault API 直接写文件系统。
- 回退不改动后端会话状态（与 OpenCode 的 `revertSession` 语义独立、可并存）。
- 必须在 UI 上如实标注能力边界：哪些文件纳入了快照、哪些没有。

**验收标准**

1. agent 修改 2 篇笔记 → 侧栏显示 2 个条目，各自有"回退"操作。
2. 单文件回退 → 该文件内容与本轮前逐字节一致，另一个文件不受影响。
3. 一键回退全部 → 两个文件都恢复。
4. 本轮新建的文件回退后进入回收站。
5. 回退后执行"恢复回退" → 回到回退前的内容。
6. 超过快照大小上限的文件在侧栏明确标注"未纳入回退"，且不提供回退按钮。
7. 在 Claude/Codex/Pi 后端下上述行为一致（不依赖 OpenCode 的 revert）。

---

### R-B4 Obsidian 原生工具

**目标**：FlowText 的 Agent 基于 Obsidian 官方 CLI，能执行"安装主题""安装第三方插件""书签/日记/孤立笔记"等**仓库级原生操作**。OpenCodian 的 agent 只能走通用文件系统与 shell，没有 Obsidian 原生能力。

**现状证据**

- `src/core/tools/toolNames.ts:5-20`：只是工具名常量表（Read/Write/Edit/Bash/Glob/...），无执行器。
- `src/core/tools/index.ts`：仅再导出，无 Obsidian API 工具实现。
- 插件**消费**外部 MCP（`AgentService.ts:203-217`），但**不托管** MCP server；唯一创建的 server 是诊断用的临时文件（`ClaudeCodeAdapter.ts:3199`）。
- 全仓库 `src/` 内无 Obsidian CLI 调用、无 `registerObsidianProtocolHandler`。

**需求**

1. 让 agent 具备 Obsidian 原生操作能力，MVP 范围：
   - 查询已安装主题 / 启用指定主题；
   - 查询已安装插件 / 安装并启用第三方插件；
   - 书签、日记、标签、属性（frontmatter）的查询与批量修改；
   - 孤立笔记、搜索。
2. 能力必须**后端无关**：四个后端都能使用同一套能力。
3. 写类操作必须纳入 R-B3 快照体系，或限定为可通过 Obsidian API 逆向执行的操作。
4. 启用/安装插件与主题属于高影响操作，必须**显式用户确认**，不得由模型自行决定执行。

**技术约束（需裁决，见 §10 Q2）**

- 路线 A（推荐先行）：接入 Obsidian 官方 CLI。
  - 插件负责：检测 CLI 是否可用、在设置中展示安装引导与状态、把可用命令写进系统提示词/技能、agent 通过其 shell 工具调用。
  - 优点：兼容性由官方保证，实现成本低。
  - 约束：依赖用户在系统层面安装 CLI；不可用时必须**明确显示"该能力不可用"**而不是静默失败。
- 路线 B（能力补足）：插件自建本地 MCP server 暴露 Obsidian API 工具。
  - 优点：能力边界完全可控，四后端均可直接消费（MCP 支持已具备）。
  - 约束：引入本地端口（安全面）、需要请求鉴权设计、实现成本显著更高。
- 两条路线都需要在 `docs/modules/**` 与 owner 划分上明确归属，不得把大段逻辑塞进 `OpenCodianView`。

**验收标准**

1. 指令"列出当前启用的主题"→ 返回与 Obsidian 设置页一致的真实列表。
2. 指令"启用主题 X"→ 生效，且该操作可被回退或至少可撤销。
3. CLI 未安装时，UI 明确提示能力不可用并提供引导，不报未捕获异常。
4. 四个后端均能执行同一指令并得到一致结果。
5. 安装第三方插件前出现显式确认对话框。

---

### R-B5 批量整理（归拢笔记 / 批量改属性）

**目标**：FlowText 的批量操作（按属性/标签/内容/标题查找并归拢笔记、批量编辑属性）。OpenCodian 的 agent 理论上能靠脚本做，但没有原生能力、也没有安全网。

**现状证据**

- 无 Obsidian 原生工具（见 R-B4）；
- 写操作无快照与回退（见 R-B3）；
- 因此"批量整理"目前是**高风险无护栏**操作。

**需求**

1. 提供批量整理的**任务模板**（供用户一键发起，而非让用户自己措辞）：
   - 按标签/属性/关键词查找笔记并移动到指定目录；
   - 批量修改 frontmatter 属性（增/删/改，可带条件）；
   - 按规则重命名并更新引用。
2. 任何批量写操作前**强制**建立 R-B3 快照，且回退入口在任务完成后立即可见。
3. 执行前显示**预览**：将要修改的文件数与具体清单，用户确认后才执行。

**技术约束**

- 本条依赖 R-B3 与 R-B4，**不得**先于两者实现。
- 任务模板与提示词分离：模板是产品资产（i18n 化），不是散落在代码里的字符串。
- 属性修改必须走 Obsidian 的 frontmatter 处理路径，避免破坏既有的 YAML 格式与属性类型。

**验收标准**

1. 发起"把标签为 #待整理 的笔记移动到 `归档/`" → 预览列出 N 篇 → 确认后执行 → 一键回退可全部恢复。
2. 批量改属性后，YAML 结构合法，Obsidian 属性面板显示正确类型。
3. 预览阶段取消 → 无任何写入。

---

## 5. 批次 C：检索与生成

批次 C 是三个独立子系统，每条都需要**先出独立设计文档**再实施。

### R-C1 整库语义检索（整库感知模式）

**目标**：FlowText 开启"整库感知"后，用户指令自动与知识库索引匹配，按匹配度把相关笔记作为参考资料喂给模型，使回复"有据可依"。

**现状证据**

- 记忆召回是**词面匹配**，语义通道明确未实现：`src/core/memory/memoryRecall.ts:8-10`（"the embedding channel is intentionally not ported"），实际选择逻辑为 `rankLexically` / `lexicalCandidates`（`:159-189`）。
- 记忆库是独立的 `.opencodian/memory/`（`memoryPaths.ts:14`），**不是 vault 笔记**——不能直接当整库检索用。
- 设置项 `memorySemanticRecallEnabled`（`src/core/types/settings.ts:3083`）名称具有误导性：生产路径只跑词面匹配。
- 上下文策略与整库感知直接冲突：`docs/requirements/obsidian-linkage.md:13` 明确"上下文采用**显式、单次发送态**策略，不自动注入，不跨轮次继承"。

**需求**

1. 提供一个**显式开关**的检索增强：开启后，用户指令与 vault 索引匹配，按匹配度选出相关笔记作为参考资料。
2. **注入必须可见、可控**：UI 显示本次注入了哪些笔记与片段；用户可逐条取消或整体关闭。
3. 关闭时，请求内容与当前实现**逐字节一致**（严格回归）。
4. 索引构建在后台进行，不阻塞 UI；笔记变更后增量更新。
5. 注入受双重上限约束：条数上限与每篇截断上限。

**技术约束**

- 与既有"不自动注入"原则的关系：本条**不推翻**该原则，而是把它从"永不注入"扩展为"仅当用户显式开启时注入，且注入内容始终可见"。既有默认行为不变。
- 检索方式需裁决（§10 Q3）。推荐：**先做词面检索**（复用 `memoryRecall` 的词面打分实现思路，零新依赖、离线可用、无 API 成本），embedding 作为后续可选增强层——而不是一开始就引入向量库（Obsidian 插件对包体积与启动开销敏感）。
- 索引存储放在插件数据目录，不得污染用户 vault 结构。
- 索引必须尊重用户的排除规则（如忽略 `templates/`、`.obsidian/`），并提供排除配置。
- 分块策略、打分公式、截断位置的语义完整性（不截断到半个代码块）需在设计文档中定案。

**验收标准**

1. 关闭状态：请求内容与当前实现逐字节一致（自动化回归）。
2. 开启状态：请求包含 ≤ K 篇参考片段；UI 显示注入清单（笔记路径 + 片段位置）。
3. 用户取消某条注入 → 该条不再进入请求。
4. 约 1 万篇笔记的初次索引在后台完成，期间编辑器操作不卡顿（给出实测耗时）。
5. 修改一篇笔记后，检索结果反映最新内容（增量更新生效）。
6. 索引目录不出现于用户 vault 的常规文件列表/搜索中。

---

### R-C2 文生图

**目标**：FlowText 集成文生图模型，在笔记中按提示词生成并嵌入图片；支持独占一行与文字环绕两种方式，比例可设置。

**现状证据**

- 无任何图像生成集成：`providerPresets.ts` 全部为对话补全供应商；`package.json` 无图像生成 SDK。
- 聊天侧能**输入**图片（vision），但没有**生成**图片的路径。

**需求**

1. 支持配置文生图模型（供应商 + 模型 + 密钥），可多个。
2. 在聊天与行内编辑中均可发起文生图：提示词 → 生成图片 → 落盘 → 插入引用。
3. 插入方式二选一：
   - 独占一行：`![[图片文件名]]`；
   - 文字环绕/行内：行内嵌入（与 FlowText 的"行间 `@` 插入即环绕"对应）。
4. 默认图片显示比例/宽度可在设置中调整（如最大宽度）。

**技术约束（本条引入了一条新的写路径，必须谨慎）**

- 这是插件**第一次由自身写入二进制资产**。既有原则是"唯一写路径 = `editor.replaceRange`"，本条扩展为：写资产（图片）+ 写引用（编辑器事务）。二者必须分别定义失败语义：
  - 图片写成功、插入失败 → 保留图片并明确提示路径（不静默丢弃，避免孤儿文件与用户困惑）；
  - 图片写失败 → 不产生任何文档改动。
- 落盘目录：默认遵循 Obsidian 的附件目录设置（`attachmentFolderPath`），允许覆盖；文件名冲突策略需确定（建议追加序号，不覆盖同名文件）。
- 生成的资产必须纳入 R-B3 快照/回退体系（可被回退移除）。
- 单张图片大小上限与超时。
- 凭据存储沿用既有密钥处理路径，不得新增明文存储。

**验收标准**

1. 配置一个文生图模型 → 发起提示词 → 图片落盘到附件目录并在笔记中插入引用。
2. 独占一行与行内两种插入方式分别可用，且渲染正确。
3. 调整设置中的宽度后，插入的图片渲染宽度随之变化。
4. 图片写入成功但插入失败时，提示中给出实际文件路径。
5. 生成失败（超时/配额）不产生任何文档改动。
6. 反向操作（撤销插入）后，图片文件可按既定策略处理（清理或保留），行为在设置中说明。

---

### R-C3 Alt 一键补全（ghost text）

**目标**：FlowText 的 Cursor 风格补全——光标处按 Alt，依据前文补全句子或段落，作为临时参考由用户决定是否写入。

**现状证据**

- 全仓库无 ghost text / inline completion 实现。
- `docs/requirements/inline-edit.md:451`：既有文档把 "inline completions（ghost text）" 列为明确不做项——本条即该迭代项。
- 现有辅助查询通道每次唤起都需新建会话（`InlineEditService` 的 dispose-on-exit 契约），冷启动成本与补全的延迟要求冲突。

**需求**

1. 光标处按下 Alt（可在设置中改绑或关闭）→ 基于光标前文生成补全建议。
2. 建议以 **ghost text** 形式显示（不进入文档、不改变 undo 栈）。
3. Tab 接受（成为一次可单步撤销的编辑事务）；Esc 忽略；继续输入则建议自动消失并取消在途请求。
4. 补全目标是"完善当前句子或段落"，**不是**一次性续写整篇。
5. 功能默认关闭（`inlineCompletionEnabled`）。

**技术约束**

- 延迟是硬指标：目标首字节 < 800ms。这要求与现有 aux 会话契约**不同的**生命周期——需要长驻或预热的只读会话（现有契约是"每次编辑新建、退出即 dispose"）。**这是本条的架构难点**，必须在设计文档中定义新的会话生命周期契约，且**不得**因此削弱只读保证。
- CM6 实现：ghost text 用 `Decoration.widget` 渲染，并配合 `EditorView.atomicRanges` 使光标跳过建议文本；不得使用 `Decoration.replace`（会破坏 undo 栈与文档一致性）。
- 输出契约需要新的提示词与解析规则：短输出、只续写、限制最大长度、**不得**重复已存在的前缀、不得输出协议标签（与行内编辑的 XML 契约**分开**，避免互相干扰）。
- 与输入竞争：用户每次键入取消在途请求；请求需可 Abort。
- IME 组合态不触发；组合完成后也不自动触发。
- 关闭时零开销（不注册 handler、不建会话）。

**验收标准**

1. 光标处按 Alt → 800ms 内出现 ghost text（给出实测数据，分后端）。
2. 继续输入 → ghost text 消失，在途请求被取消（无迟到覆盖）。
3. Tab 接受 → 文本进入文档，Ctrl+Z 一步撤销。
4. Esc 忽略 → 文档零变化。
5. 建议文本长度受上限约束，且不重复光标前已有的文本前缀。
6. 中文输入法组合态不触发。
7. 功能关闭时无任何后台会话或监听器。

---

### R-C4 PDF 读取 / 索引 / 内文交互

**目标**：FlowText 支持超大 PDF 的本地索引与毫秒级检索、PDF 原文选中问 AI、以及把结果保存为笔记注释。OpenCodian 完全空白。

**现状证据**

- 全仓库与 PDF 相关的唯一代码是 MIME 映射：`src/shared/obsidianContext.ts:61`。
- `ContextAttachmentBuilder.ts:86-114`：PDF 在远程模式被判定为二进制而拒绝；本地模式下 `textSnapshot` 留空——**不解压任何内容**。
- `package.json` 无 PDF 解析库。

**需求（分三期）**

1. **一期（文本层）**：把小体积 PDF 的文本层提取为上下文文本，可随对话发送。
2. **二期（本地索引）**：为大型 PDF 建立本地化索引（切片 + 打分），检索后只注入命中片段，避免整本投喂撑爆上下文；索引构建一次性、之后毫秒级检索。
3. **三期（内文交互）**：在 PDF 视图内选中原文 → 触发对话 → 结果可复制，并可保存为这条笔记的注释/高亮。

**技术约束**

- 需要引入 PDF 解析依赖（如 `pdfjs-dist`），必须评估**包体积与启动开销**（插件对体积敏感），并确定按需加载策略。
- 一期不能复用现有文本上下文通道（`textSnapshot` 明确为文本），需要新的上下文条目类型。
- 三期存在**技术未知**：Obsidian 内置 PDF 阅读器是内嵌 pdf.js，能否取得选区、能否挂工具栏按钮，取决于未公开的视图结构 → **必须先做可行性验证**，验证失败则三期降级为"通过命令打开对话窗 + 手动粘贴文本"（FlowText 对无文字层 PDF 的做法）。
- 索引存储与检索实现应复用 R-C1 的索引基础设施，**不得**另建一套独立的检索栈。
- 任何 PDF 相关写入（注释/高亮）都需纳入 R-B3 快照体系。

**验收标准**

1. 一期：可从 PDF 提取文本并作为上下文发送；无文字层 PDF 给出明确提示。
2. 二期：数百页 PDF 建立索引后，问答能引用具体片段；检索响应时间达标（给出实测）。
3. 三期（若可行性验证通过）：PDF 内选中 → 对话 → 结果可保存到笔记注释。
4. 索引构建期间 UI 不阻塞，且可中断/取消。

---

### R-C5 Canvas 生成与节点级 AI

**目标**：FlowText 可让 AI 基于已有笔记创建 Canvas 白板（把笔记内容拆为多个节点）、支持节点级 AI 编辑。

**现状证据**

- `src/` 内**零** `.canvas` 处理逻辑；`canvas` 关键词的命中全部是渲染内部（`glassOctahedronDemo.ts`、`shuding*.ts` 的 `canvasEl`/`canvasCtx`）。
- `.canvas` 不在 MIME 映射中，被视为不透明二进制。

**需求**

1. 依据选定的笔记（或 R-B2 的主题组）生成 `.canvas`：每篇笔记拆为一个或多个节点。
2. 节点级 AI 编辑：选中节点卡片 → 工具栏按钮 → 对该节点内容做 AI 改写（例如改写为 Mermaid 代码块）→ 确认后写回白板。
3. 支持基础结构操作：折叠/展开、连接节点。

**技术约束**

- `.canvas` 是 JSON（`nodes` / `edges`），插件可直接读写；写回必须走 vault API 并纳入 R-B3 快照。
- 节点级 AI 编辑需要在 Canvas 视图挂 UI，**Obsidian 未公开稳定的 Canvas API** → 与 R-C4 三期同样是**技术未知项**，必须先做可行性验证（挂载点、选中态获取、写回触发）。
- 生成节点时的布局算法（避免节点重叠）需要设计文档定案，建议使用简单的分层/网格布局而非力导向（确定性优先）。
- 生成是**新增文件**，不修改既有笔记；失败时不得留下半个文件（先写临时内容再原子落盘，或失败即回收）。

**验收标准**

1. 选中 3 篇笔记 → 生成一个 `.canvas`，含 3 个及以上节点，节点不重叠。
2. 生成的 `.canvas` 能被 Obsidian 正常打开与编辑（结构合法）。
3. （若可行性验证通过）选中节点 → AI 改写 → 确认后写回，Ctrl+Z 可撤销。
4. 生成失败不留下损坏的 `.canvas` 文件。

---

### R-C6 外部接口（远程驱动）

**目标**：FlowText 提供 DeepSeek Harness 接口，外部程序（乃至手机）可以驱动其 Agent 操作仓库。OpenCodian 是纯客户端，不暴露任何外部入口。

**现状证据**

- `src/core/acp/AcpClientManager.ts:1, 51-87`：ACP 为**客户端**——派生并消费外部 ACP agent 的 stdio，**无 host/server 模式**。
- 全仓库无插件自有监听端口；grep 命中的 server 均为后端子进程（`CodexAppServerTransport.ts:128` 的 `codex app-server`、`OpenCodeAuxScope.ts:546-548` 的 aux 本地传输）。
- 无 `registerObsidianProtocolHandler`。

**需求**

1. 提供一个本地接口，允许外部程序：发起指令、查询会话状态、获取结果。
2. 默认**关闭**；开启需显式操作并生成访问令牌。
3. 提供能力范围限制：哪些操作可以被远程触发需明确白名单。

**技术约束（安全优先，本条安全面最大）**

- 默认仅绑定 `127.0.0.1`；绑定到其他地址需二次确认并给出明确风险警告。
- 必须令牌鉴权；无令牌或错误令牌一律拒绝（无匿名访问路径）。
- 全部请求进审计日志（时间、来源、指令摘要、结果终态）；日志遵守既有 redaction 规则，不得记录凭据。
- 不得通过该接口暴露：凭据、`~/.claude`/`~/.codex`/`~/.pi`/`~/.opencode` 等配置根的内容、vault 外的文件读取。
- 接口实现归属需在 owner 划分上明确，不得堆进 `OpenCodianView` 或 `main.ts`。
- 建议先做**最小可用**：单会话、单指令、同步取结果；不做多用户、不做权限分级。

**验收标准**

1. 关闭状态：不监听任何端口（含 IPv6）。
2. 开启后：无令牌请求被拒绝；有效令牌可发起指令并取回结果。
3. 请求记录进入审计日志，且日志中无凭据、无用户指令全文（除非显式开启调试采集）。
4. 尝试通过接口读取 vault 外文件被拒绝。

---

## 6. 跨批次硬约束

以下约束对批次 A/B/C 全部生效，任何一条需求都不得以"为了能用"为理由放宽。

1. **只读辅助契约不得削弱。** `AgentAuxQueryCapability`（`src/core/agents/backend/AgentAuxQueryCapability.ts:106-122`）的 fail-closed 与运行时只读证明是行内编辑的安全基座。图片附件（R-A4）、流式（R-A3）、全文模式（R-A6）、多片段（R-A5）**都不得**使 aux 会话获得任何写类工具；`findWriteToolCalls` 审计（`:177-193`）保持为阻断性检查。
2. **写路径必须是显式且有限的。** 批次 A 保持"单次 `editor.replaceRange`"；批次 C2（图片资产）与 C5（Canvas）新增写路径，必须在设计文档中显式定义，并纳入 R-B3 快照体系。禁止出现"顺手直接写文件系统"的实现。
3. **落盘前必须有脏检查。** 所有会改写用户文本的路径（多片段、全文、流式、自动内链）在接受/写入前都必须保留快照比对语义。内链改写（R-B1）必须在 diff 中可见，不得在落盘时静默改写。
4. **fail-closed 优先于可用性。** 新增请求形态、图片附件、超限、协议冲突一律**拒绝并提示**，不静默降级、不部分应用。
5. **后端无关是验收项，不是口号。** 新能力在四后端（opencode / claude-code / codex / pi）上一致；某后端不支持的，如实显示"该后端不支持此能力"，不得静默退化或伪造成功。
6. **自动注入必须显式、可见。** R-C1 是本仓库首次引入"自动选择上下文"，必须由用户显式开启，且注入内容始终可见、可逐条取消。
7. **能力缺失要如实呈现。** 涉及技术未知的需求（R-C4 三期、R-C5 节点编辑、R-B4 路线选择）必须先做可行性验证；验证失败就如实标注降级方案，不得按计划伪装完成。

---

## 7. 新增设置项与本地化

所有设置项都要同时更新 `src/core/types/settings.ts`（含默认值与迁移归一化）、设置 UI（`src/features/settings/OpenCodianSettings.ts` 及其分区）、`zh.ts` / `en.ts` 双语 locale。

| 设置 | 默认 | 说明 |
|---|---|---|
| `inlineEditTriggerAt` | `false` | `@` 触发行内编辑（R-A1，§10 Q1） |
| `inlineEditPresetPrompts` | 内置集 | 预设提示词，含内置与自定义（R-A2） |
| `inlineEditMaxConcurrentEdits` | `3` | 并行行内编辑上限（R-A5） |
| `inlineEditDocumentModeEnabled` | `true` | 全文修改模式开关（R-A6） |
| `autoInternalLinkEnabled` | `false` | 自动内链（R-B1） |
| `autoInternalLinkExcludedTerms` | `[]` | 内链误报排除词（R-B1） |
| `contextGroups` | `[]` | 上下文组 / 主题（R-B2） |
| `editRevertEnabled` | `true` | 编辑回退总开关（R-B3） |
| `editRevertSnapshotLimitMb` | 建议 `50` | 快照存储上限（R-B3） |
| `obsidianToolingMode` | `off` | `off` / `cli` / `mcp`（R-B4，§10 Q2） |
| `vaultRetrievalEnabled` | `false` | 整库检索（R-C1，§10 Q3） |
| `vaultRetrievalTopK` | 建议 `6` | 注入条数上限（R-C1） |
| `vaultRetrievalMaxCharsPerNote` | 建议 `4000` | 每篇截断上限（R-C1） |
| `vaultRetrievalExcludedPaths` | `[]` | 索引排除规则（R-C1） |
| `imageGenerationModels` | `[]` | 文生图模型配置（R-C2） |
| `imageGenerationMaxWidth` | 建议 `600` | 插入图片默认宽度（R-C2） |
| `inlineCompletionEnabled` | `false` | Alt 补全（R-C3） |
| `inlineCompletionMaxChars` | 建议 `300` | 补全输出上限（R-C3） |
| `pdfIndexEnabled` | `false` | PDF 索引（R-C4） |
| `remoteControlEnabled` | `false` | 外部接口（R-C6） |
| `remoteControlBindAddress` | `127.0.0.1` | 绑定地址（R-C6） |

---

## 8. 测试计划

### 8.1 单元测试（纯函数，不依赖 Obsidian）

- R-A1：`@` 触发条件判定（行首、空白后、邮箱中、组合态）。
- R-A2：`#` 菜单过滤与触发条件、`#标签` 不误触、Enter/Esc 归属。
- R-A3：渐进解析与严格解析的一致性；多标签/未闭合下预览被清除；节流合批。
- R-A6：`<editor_document>` 请求构建、长度上限、协议标签冲突拒绝、降级判定。
- R-A7：目录条目渲染、上限计数语义、路径校验。
- R-B1：标题匹配、代码块排除、已有链接排除、排除词、死链拒绝。
- R-B3：快照去重与淘汰、回退与"恢复回退"的对称性。
- R-C1：打分与排序、截断边界（不截断半个代码块）、排除规则。
- R-C3：补全输出上限、前缀不重复校验。

### 8.2 契约测试（跨模块）

- R-A4：`AuxQueryTurnRequest.images` 在四后端的序列化落地；**vault 快照在 query 前后无变化**（含 Codex 临时文件场景）。
- R-A5：多片段装饰集的 upsert/remove 语义；交叉接受后各编辑锚点映射正确；脏检查互不误伤。
- R-B3：四后端下回退行为一致（不依赖 OpenCode revert）。
- R-C1：关闭状态与当前实现的请求逐字节一致（严格回归）。

### 8.3 手动验收

- 行内编辑：四种形态（selection / cursor-inline / cursor-inbetween / document）× 四后端 × 流式开关。
- 多片段：同笔记并发 2–3 个编辑的交叉接受与冲突路径。
- 中文输入法：`@`、`#`、Alt 补全在组合态下均不误触。
- 大笔记（>20k 字符）的全文模式与 diff 降级。
- 回退：单文件 / 整轮 / 新建文件进回收站 / 恢复回退。
- 降级与不可用路径：CLI 未安装、后端不支持图片、超限拒绝。

---

## 9. 里程碑与出口标准

| 里程碑 | 内容 | 出口标准 |
|---|---|---|
| A1 入口层 | R-A1、R-A2 | `@` 与 `#` 全流程可用；IME 与误触用例全过 |
| A2 生成层 | R-A3、R-A4 | 流式预览与一次性路径逐字节一致；四后端图片链路通过 vault 快照审计 |
| A3 架构层 | R-A5、R-A6、R-A7 | 多片段交叉接受无漂移；全文模式可单步撤销；目录上下文可被模型读到 |
| B 领域能力 | R-B1…R-B5 | 内链无死链；回退在四后端一致；原生工具能力可用或如实标注不可用 |
| C 检索与生成 | R-C1…R-C6 | 每条各自的验收标准；技术未知项完成可行性验证并如实记录 |

每条里程碑完成后按仓库既有门禁执行：`npm run verify`（lint 零警告 + typecheck + 全量测试 + 生产构建）、`npm run check:module-docs`、`npm run check:graphify`，并按需部署 Test Vault。

---

## 10. 开放问题（需裁决）

| # | 问题 | 建议 | 理由 |
|---|---|---|---|
| Q1 | `@` 是否作为**默认**触发器？ | **不默认**。默认提供命令 + 引导绑定热键，`@` 作为可选开关（R-A1 默认 `false`） | `@` 是邮箱、@提及的常用字符，且与 Obsidian 生态其他插件的 `@` 用法冲突；默认开启的误触代价高于 FlowText 的入口便利性 |
| Q2 | Obsidian 原生工具：官方 CLI 还是自建 MCP server？ | **先 CLI，MCP 作为补足** | CLI 成本低、兼容性由官方保证；MCP 能力更可控但引入本地端口与鉴权设计，应等 CLI 的能力边界被证明确实不够时再投入 |
| Q3 | 整库检索：词面还是向量？ | **先词面**，embedding 作为可选增强层 | 词面零新依赖、离线可用、无 API 成本；插件对包体积与启动开销敏感，向量库应先证明必要性 |
| Q4 | 编辑回退的实现基准：插件侧快照，还是依赖后端 rewind？ | **插件侧快照**（后端无关） | 后端 rewind 仅 OpenCode 具备且是会话级，无法覆盖单文件回退与新建文件；Claude 的 checkpointing 上游有 bug 且不稳定 |
| Q5 | 批次顺序是否按 A→B→C？ | **是** | A 批次是在既有引擎上补交互与生成体验，投入产出比最高；B 批次依赖回退与原生工具的组合；C 批次每条都是独立子系统，需各自先出设计文档 |
| Q6 | R-A4 的 Codex 临时图片文件是否可接受？ | **可接受**，前提是写在系统临时目录且 dispose 清理 | 这是唯一能让 Codex 支持图片输入的现实路径；但必须显式纳入"vault 零变化"审计的边界定义（临时目录在 vault 之外） |

---

## 11. 明确非目标

1. **不做 FlowText 宣告的 Word / Excel / PPT 办公方向**——与本插件"Obsidian + coding agent"的定位不符。
2. **不做 FlowText 的能力自我限制。** FlowText 刻意不做成 Claude Code / Codex 那种通用 Agent；OpenCodian 已有完整 agent 能力，不因对齐而收缩。
3. **不复制 FlowText 的实现路径**（尤其不复制"靠提示词保证行为"的做法——本仓库的安全约束要求机制保证）。
4. **不为对齐而引入与既有架构冲突的依赖**（向量库、第二套检索栈、第二套图片传输实现）。
5. **不改动既有只读辅助契约、唯一写路径、脏检查三项硬约束。**
6. **不做逐块 accept/reject**（`docs/requirements/inline-edit.md:451` 既有的明确不做项，本批次不推翻）。

---

## 12. 状态回填证据（2026-09-19）

分支 `feature/flowtext-parity`（50 个提交领先 `origin/main`，其中 22 个为 graphify 刷新）。状态口径：**DONE** = 核心验收已实机验证；**PARTIAL** = 已实现且有自动化证据，但某条验收标准尚未实机覆盖。

| 编号 | 实现提交 | 自动化证据 | 实机证据 | 未覆盖（PARTIAL 原因） |
|---|---|---|---|---|
| R-A1 | `d892256d` | `InlineEditAtTrigger.test.ts` 等 | 行首 `@` 开面板且 `@` 不入文档；`user@example.com` 中间不触发；设置页「@ 键唤起」+ 未绑定快捷键提示 | IME 组合态、Reading mode |
| R-A2 | `d892256d` | `InlineEditPresetMenu/Presets/InputOverlayPresetMenu.test.ts` | `#` 弹出六个内置预设；Enter 填入且**不发请求**；Esc 关闭内容不变 | `#标签` 误触与空自定义集仅单测覆盖 |
| R-A3 | `78eeef05` | `InlineEditStreamPreview.test.ts` | 面板 busy 即时、最终预览 + 拒绝/接受、拒绝后文档逐字节未变；**换 `claude-code`（CLI 确为流式）以 250ms 采样复测**：48 帧中仍只有 2 个状态（251ms busy → 12067ms 完整预览） | **量化承诺仍不可演示，但原因不是供应商**：输出契约要求完整的 `<replacement>` 标签才可解析，解析前的片段没有可渲染语义，故实现只提供 busy 状态而非逐段增长的内容帧。要演示流式 diff 需改输出契约（设计变更，非缺陷） |
| R-A4 | `78eeef05` | 四后端审计脚本含图片轮次 | **六条验收全部实机**：①真实粘贴图片 → 模型读出公式并返回 LaTeX → diff 显示 → 接受插入；②四后端真 CLI 审计 PASS（vision 模型下模型确实读到图、vault 快照零变化、Codex 临时目录 0）；③面板内粘贴后出现 1 个图片 chip 且含**真实缩略图**（`<img src="data:image/png;base64,…">`），空行元素 `display:none` 高度 0，chip 可移除（截图 `ra4-image-chip.png`）；④**定界符按锚点形态**：行内锚点 → `$E = mc^2$`、段间锚点 → `$$E = mc^2$$`（截图 `ra4-latex-inline.png` / `ra4-latex-display.png`）；⑤**超限拒绝**：粘贴 5,881,918 字节 PNG（上限 4 MiB）→ chip 数不变（未静默接受）并提示「图片超过 4MB 大小上限，已拒绝。」；⑥不支持图片时模型如实说明看不到图（图片确以图像形式到达） | 拖拽入面板未验（picker 拖拽已验，见 R-A7） |
| R-A5 | `47e90f95`、`9babaf49`、`49c6b55c` | `InlineEditWidgets.test.ts`、`InlineEditInputOverlay.test.ts`、`InlineEditOverlayDismissal.test.ts` | 并行上限设置项与文案已验；**同一笔记内两编辑共存**（选区 + 光标，`overlayCount: 2`，截图 `ra5-two-panels.png`）；**交叉接受无漂移**（接受 A 只改 line 2，第二段未波及，B 面板/模式/输入内容/锚点行全保留）；**面板互不遮挡**（重叠面积 0，各自工具栏经 `elementFromPoint` 可达）；**Esc 只作用于聚焦编辑**（焦点在 A 时真实 Escape 只关 A，B 内容不丢） | — |
| R-A6 | `47e90f95`、`f33732bc` | `InlineEditDocumentMode.test.ts` | 「整篇」模式切换 active 正确转移；**独立命令入口**（面板模式「整篇」、占位符「描述要如何修改整篇笔记…」）；**二次确认弹窗**（「应用整篇修改？」+ 取消/替换整篇，确认前文档逐字节未变，截图 `ra6-document-confirm.png`）；**单步撤销**（一次 Cmd+Z 精确还原原文，`restoredExactly: true`）；**降级差异视图**（3961 字符触发「内容过大，仅显示前后对照。」且词级标记数为 0，截图 `ra6-degraded.png`）；确认按钮标签对比度 4.22:1 → **4.98:1** | 20k+ 字符笔记未单独构造（降级路径已由 3961 字符触发并验证） |
| R-A7 | `47e90f95`、`c01a261f` | `InlineEditContextUi.test.ts` | 连续点击 3 行 → 3 个 chip 且选择器保持打开；目录条目可附加/取消；搜索 + 截断提示；截图 `ra7-picker-chips.png`。**「模型能读到附加内容」已实机成立**：辅助会话把附加笔记物化到临时工作目录，模型用只读 `Read` 工具读取它。**四后端口令回显测试**（§6.5）：`claude-code` 两次独立运行均把只存在于附加笔记中的口令写进改写结果 → **上下文投递成立**；`pi` 在路径配为对象形态后辅助会话可启动；`opencode` 走只读工具路径并给出诚实文案；`codex` 如实拒绝（需 app-server） | 拖拽（picker 已验，拖入未验） |
| R-B1 | `f6543338`、`ba9c7e4b` | `InlineEditAutoLink.test.ts`、`AssistantAutoInternalLinkService.test.ts`、`MessageFinalizationService.autolink.test.ts` | **行内编辑侧：内链在差异视图中可见**——参考笔记含 `## 注意力机制` 并经真实 UI 附加后，预览（diff）中出现 `[[ref-attention.md#注意力机制]]`，接受前即可见（截图 `rb1-autolink.png`）；**需协议合规模型**（`deepseek/deepseek-v4-flash` 会先吐伪工具标记）。**聊天侧已接线**（`ba9c7e4b`：`MessageFinalizationService` 轮次边界 + 共享 `AutoInternalLinkProcessor`，不 fork 匹配器），实机确认**存储文本确实被后处理**（`[[rb1-chat-ref.md#注意力机制]]让模型…`，指向真实标题且保留原文措辞） | **缺陷 R-B1-D1（高，已派修）**：默认 opencode 后端上链接进了存储但**渲染的消息看不到**（整棵消息子树 0 个 `<a>`），且重载后被权威重同步丢弃——违反「必须可见、不得静默改写」。claude-code 的**聊天**会话在本机退出码 1（其辅助会话正常，未定性为产品缺陷）；死链与代码块内不插链接仍由单测覆盖 |
| R-B2 | `f6543338` | `contextGroupPlan.test.ts` + 组附加用例 | 设置分区渲染（截图 `rb2-context-groups.png`）；**三条验收全部实机**：①聊天 composer 的 `+` 打开模态「选择一个 vault 文件」，其「主题组」入口一键附加 **8 个 chip**（聊天侧 `cap = Infinity`），行内面板同一动作按需求 3 以 **5 条上限 + 明确省略条数**工作；②主题含已删除笔记 → 跳过并**具名**提示「1 个条目不存在，已跳过：rb2-acc-deleted.md」，不报错；③插件重载后 `contextGroups` 仍为 `{name, n: 9}`，入口仍提供该主题且行为一致 | — |
| R-B3 | `67ce67ae` | 58 例（含 retention / backendAgnostic） | 回退恢复文件、新建目录删除、有内容目录保留并如实上报、写入后**即时**可回退（3ms）；**侧栏入口已验**：条目渲染 + 「回退」/「全部回退」按钮，收起态提示「本轮修改（可回退）：N」（截图 `rb3-revert-sidebar.png`） | — |
| R-B4 | `b17508d7` | 52 例（含 gate 脚本真实 `/bin/sh` 测试） | CLI 探测 available；闸门就绪；真实包装脚本 → 确认框 → 拒绝/超时 → **"Nothing was executed"** | Windows 平台（已在 UI 如实标注不支持） |
| R-B5 | `572947af`、`40a29b85`、`7deadbab`、`47790e76` | 46 例（含替身父目录校验） | 预览列 2 篇 → 确认执行 → 移动 → 一键回退；目录不存在时创建并披露；空目录回退时删除、有用户内容时保留 | — |
| R-C1 | `07ba94d7` | 52 例（含关闭态逐字节回归） | 54/54 篇约 1s 索引；chip 显示路径 + 行号范围；取消有粘性；chip 对比度 7.39:1；索引在 `.opencodian/vault-index/` | 万篇级首次索引耗时（需万篇规模库） |
| R-C2 | `fe595ffb`、`7b022968` | 58 例（失败语义矩阵逐支） | 对本地 stub：线格式正确、资产落盘 7832 字节 PNG、嵌入宽度 `|600` 生效、生成失败零文档改动、回退移除资产 | 真实供应商响应差异（本机无图像端点） |
| R-C3 | `f00653a3`、`e7e1abda` | 106 例 + 组合层 notify 测试 | 幽灵文本真实续写；斜体弱化色对比度 10.74:1；Esc 清除；后端不可用时**如实提示**；**实体 Alt 手势已验**（CDP 真实 keydown/keyup，页内同一时钟计时）；**继续输入即清除**；**Tab 接受后一次 Cmd+Z 精确还原**；建议形态为一句而非续写整篇 | **首字节 800ms 仅最佳情况达标**：分模型实测 `opencode-go/gpt-5.6-luna` 2610/2188/2754ms、`deepseek/deepseek-v4-flash` 1307/1252/923ms、`deepseek/deepseek-flash` 1315/1111/**692ms**。架构为渐进渲染（首块即 ghost），故差距在模型侧；补全与行内编辑**共用** `inlineEditModelOverrides`，若要稳定达标需独立的补全模型设置项。IME 组合态仍未验 |
| R-C4 | `2ed00f27`、`3e9766ad`、`0e591a8b` | 90 例 + 阶梯证据化用例 | 引擎加载成功、一期提取出 4 行真实文本、sidecar 注释写入并被回退移除；**真实 UI 流程已验**：带文字层 PDF + 真实拖选 + `pdf-ask-selection` 带入上下文 chip；无问答时如实提示；**D4 已修复并实机复验**：真实选区前阶梯为 **B**（理由「unproven on a live selection」），修复后的 ctx 返回合法 range string，真实捕获后**升级为 A**（理由「proven on a live selection」）——A 级现在基于证据且真正可用 | 大 PDF（数百页）索引耗时与问答引用片段未验；`pdfjsWorker` 全局污染为**未证实风险** |
| R-C5 | `71bf642d`、`fac1a534` | 99 例 + `CanvasIntegrationController.writeCoverage.test.ts` | 门禁 A 级（可写回）；生成 3 节点无重叠、Obsidian 正常渲染；失败不留文件；**入口已定因**：真实入口是选中浮动工具条 `.canvas-menu` 内的「AI 改写节点」按钮（与原生项并列，稳定出现），此前「间歇缺席」是探针找错目标（`onSelectionContextMenu` 在 1.13.7 真实右键路径下 `calls: 0`）；**端到端已跑通**：指令弹窗 → Mermaid 预览 → 写回生效；**D1/D2 已修复并实机复验**：写回后真实 `Cmd+Z` **还原文件**（根因是 `setData()` 已压历史而 `requestSave()` 默认再压一次相同快照），侧栏出现该 `.canvas` 条目且 `revertFile` 返回 `{ ok: true, changed: 1 }` 并还原内容 | — |
| R-C6 | `6e488736` | 123 例（以负例为主） | 关闭态 IPv4+IPv6 零监听且关闭后端口释放；401 与错令牌**逐字节相同**；审计无令牌无指令正文；越权结构性拒绝 | — |

### 跨条目修正

- **四后端上下文一致性**（`6cb0da04`）：修复前**上下文附件（文件/文件夹/PDF/检索片段）在 Claude/Codex 上完全到不了模型**（`buildObsidianContextTag` 仅被 OpenCode 序列化器调用；`grep contextAttachments|contextItems src/core/agents/backend/` 零命中）。修复扩展共享模块 `src/shared/obsidianContext.ts` 而非各写一套，顺序为 `[工具][记忆] → 用户文本 → 上下文块`（尊重提示缓存纪律），并以字节级对等测试钉住。**端到端已实机复核**：以「口令回显」为判据（口令只存在于附加笔记中），`claude-code` 两次独立运行均回显成功；`opencode` 走只读工具路径并如实提示；`codex` 因辅助会话需 app-server 而**如实拒绝**（fail-closed，符合 §6.5/§6.7）；`pi` 在可执行路径配为对象形态后可启动。另登记一条健壮性缺口：`normalizeBackendSettings` 对字符串形态的后端配置**静默清空**（旧版本/手改/跨平台同步留下的形态会被无声丢弃，建议迁移而非丢弃）。
- **缺陷修复链**：R-B5-D1（移动到不存在目录静默无操作）→ R-B5-D2（用 `adapter.remove` 删目录被静默吞掉）→ R-B5-D2b（`adapter.rmdir` 同样抛 `EISDIR`，改用 `vault.delete`，并把测试替身改为与运行时一致）；R-C4-D1（阶梯门禁竞态致 A 级在正常路径永不激活）、D2（卸载抛错）、D3（相对路径喂给 `createRequire` 致引擎在生产环境永不加载）；R-C3-D1（`notify` 未接线致四条失败提示全静默）；R-C2-D1/D2/D3（畸形配置抛错、插件轮次 10 分钟不可回退、模态框内边距不一致）。

### 新登记待修项（实机发现）

**行内编辑遇到「工具调用式回复」时显示原始协议标记** —— **已修复并实机复验**（`349c589a` → 补齐全角形态 `1919b7d7`）。附加了上下文时，模型可能选择用只读工具读取该笔记而不产出 `<replacement>` 标签；修复前面板既无改写结果也无面板内错误，唯一可见产物是澄清通道里的原始标记。现在这类输出统一映射为诚实文案（`inlineEdit.reply.toolCallInspectedContext` / `unrenderableProtocolOutput`），fail-closed 语义不变。

**这里有一次值得记住的假通过**：首版守卫的单测全绿，实机却完全无效——夹具写的是 ASCII `<|tool call>`，模型实际吐的是**全角竖线** `｜`（U+FF5C）加空格分隔复数标签名（`<｜tool calls> <｜tool invoke …> <｜tool parameter …>`）。同一配方在旧构建上 3/3 复现泄漏、在新构建上 3/3 显示诚实文案。教训：**验证夹具必须逐字取自真实产物**。

### 本轮实机新发现、已派修的缺陷

- **R-C5-D1 / D2**（§6.2 与 R-C5 验收 3）—— **已修复并实机复验**（`fac1a534`）：画布文本节点写回原本绕过 Canvas 视图的数据/历史管线（原生 Ctrl+Z 无效），且 `.canvas` 因 `isMarkdownPath` 过滤而进不了 R-B3 快照体系。修复后写回走 `setData() + requestSave(false)`（旧实现的 `requestSave()` 默认再压一次相同快照，导致第一次 Ctrl+Z 只是重放同一状态——这是「撤销无效」的真正根因），并新增窄谓词 `isRevertibleTextPath`（md + `.canvas`）只用于批量捕获与 `notePluginWrite`，写前捕获、不可用时拒绝写入。实测：`Cmd+Z` 还原文件、侧栏出现 `.canvas` 条目、`revertFile` 返回 `{ ok: true, changed: 1 }` 并还原内容。
- **R-C4-D4**（高）：A 级原生选区序列化在**真实选区**上必抛 `e.contains is not a function`（插件传入的 ctx 只有 `{ win }`），被 `catch` 吞掉后降级到 B 级 DOM 路径——于是选区级 `#page&selection` 回链与高亮反馈静默失效，而阶梯仍报 A。已实测 `{ win, contains: (n) => document.contains(n) }` 返回合法 range string `"0,0,0,57"`。修复方向：传入可用的 `contains` 谓词，并让 A 级判定**基于真实选区的证据**而非「函数可调用」。
- **系统化对比度**（设计契约）—— **已修复并实机复验**（`6d683ff9`）：宿主主题的 `.mod-cta` 配对实测 **2.87:1**（`rgb(170,17,65)` 底 + 黑标签）、`.mod-warning.mod-destructive` **4.22:1**、`--text-error` 正文 **4.2:1**，均低于 13px 文本下限。现收敛为**一套共享规则**（`src/style/modals/plugin-modal-contrast.css`，作用于 6 个插件弹窗根类），采纳实机证据改为**只提亮标签、不声明背景**（背景声明在 (0,2,0) 特异性下会静默输掉级联——实测印证），并删除各弹窗的重复规则与未生效的 ink 混色声明。实测：画布弹窗「改写」`.mod-cta` **7.33:1**（原 2.87:1）、整篇确认「替换整篇」**4.98:1**（原 4.22:1）。

### 全局未覆盖清单（如实登记）

本轮已补齐（详见上表）：面板贴图（chip 缩略图 + LaTeX 定界符）、多片段交叉接受与键盘作用域、大笔记全文模式与 diff 降级、二次确认与单步撤销、内链在 diff 中可见、C5 节点 AI 改写端到端、C4 内文选中提问、R-C3 实体 Alt 手势与 Tab/撤销。

仍未覆盖（如实登记）：**IME 组合态**（`@`/`#`/Alt 与行内编辑/补全的 `isComposing` 交互，仅单测覆盖）；**万篇级索引首次耗时**（需万篇规模库）；**大 PDF（数百页）索引耗时与问答引用片段**；**R-C3 800ms 首字节的稳定性**（仅最佳情况 692ms 达标，且补全与行内编辑共用模型设置）；（四后端上下文投递已由口令回显实机覆盖，见上）；**R-C5 的节点级 AI 写回撤销与 R-B3 覆盖、R-C4 的 A 级序列化、插件弹窗对比度均已修复并实机复验**；**R-C2 真实供应商文生图**（本机无图像端点，用本地 stub 验证线格式与落盘）。

未证实风险：`pdfjsWorker` 全局污染（干净进程对照显示 PDF 不渲染与本插件无关，故不记为缺陷，但我们的引擎入口确实写入该全局）。
