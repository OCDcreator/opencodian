# FlowText 对齐实施计划（编排总纲）

- 日期：2026-09-17
- 需求基准：`docs/requirements/flowtext-parity.md`（编号 R-A1…R-C6，验收标准以该文档为准）
- 工作分支：`feature/flowtext-parity`，worktree：`.worktrees/flowtext-parity/`
- 编排模式：主智能体只做编排与验收；实现由子智能体完成（模型 `kimi-code/kimi-for-coding`）。
- 状态回填：每个里程碑验收通过后，回填需求文档对应条目的状态列并附证据。

---

## 1. 不可违背的共享约束（所有子智能体必须遵守）

1. 需求文档 §6 跨批次硬约束逐条生效：只读辅助契约不削弱；写路径显式且有限；落盘前脏检查；fail-closed 优先；后端无关是验收项；自动注入显式可见；能力缺失如实呈现。
2. 仓库门禁全绿才算完成：`npm run verify`（lint 0 警告 + typecheck + 全量测试 + 生产构建）、`npm run check:module-docs`、`npm run graphify:update:src`（src 变更后必须刷新）、`npm run check:devlog-order`（若动 devlog）。
3. 修改任何模块前先跑 `npm run inspect:owner -- <path|symbol>` 确认 owner 与允许依赖；模块边界变化必须同步 `docs/modules/**`。
4. 修改函数/类/方法前按 AGENTS.md 执行 CodeGraph `callers`/`impact`（显式有限 depth），多定义符号用 `file` 参数消歧。
5. 设置项变更必须四件套同步：`src/core/types/settings.ts`（默认值+迁移归一化）、设置 UI、`src/i18n` 的 `zh.ts`/`en.ts`、必要时样式。
6. 不新造薄 helper/adapter 层；优先扩展既有 owner。不膨胀 `OpenCodianView.ts` / `OpenCodeService.ts`。
7. 子智能体**不部署** Test Vault、**不操作主仓库**；一切改动限制在 worktree 内。部署与实机截图验收由主智能体在里程碑边界统一执行。
8. 单元测试跟随仓库既有约定（jest，`tests/` 与既有 `*.test.ts` 模式）；新增需求对应的纯函数逻辑必须有单测（需求文档 §8.1/§8.2 清单为最低集合）。

## 2. 里程碑与子智能体分工

### 里程碑 A1：入口层（R-A1 + R-A2）
- 子智能体 A1（单任务，串行）。
- R-A1 `@` 唤起：CM6 `EditorView.inputHandler` 拦截（行首或空白后），IME 组合态不拦截，`@` 不落文档；`inlineEditTriggerAt` 默认 false；设置页热键发现性入口；既有三入口不变。
- R-A2 `#` 预设菜单：行内面板输入区 `#` 触发（开头或空白后，后紧跟非空字符不触发）；复用 `choicesToMenuItems`/`ComposerPopoverFrame` 原语；Enter 填入不自动提交；Esc 优先被菜单消费；内置默认集 + 用户自定义集（设置页增删改）；新设置 `inlineEditPresetPrompts`。
- 关键文件：`src/main.ts`（命令注册/hotkeys 发现性）、`src/features/inline-edit/InlineEditController.ts`、`InlineEditInputOverlay.ts`、`InlineEditSelectionAffordance.ts`、设置四件套。
- 验收：需求文档 R-A1/R-A2 验收标准逐条 + 单测（触发判定、菜单过滤、Enter/Esc 归属）+ `npm run verify` 全绿。

### 里程碑 A2：生成层（R-A3 + R-A4）
- 子智能体 A2（A1 验收后启动，串行）。
- R-A3 流式 diff 预览：`AuxQueryTurnRequest.onTextChunk` 接缝接入 `InlineEditService.submit()`；渐进解析只用于渲染，收尾必须过 `parseInlineEditResponse()` 严格校验，不一致以严格解析为准；rAF 合批节流；`busy: true` 生成中标识；澄清循环流式显示在输入框上方；Esc 即取消无残留装饰。
- R-A4 面板贴图：`AuxQueryImageAttachment` + `AuxQueryTurnRequest.images` 扩展；**四后端全部实现图片传输**（复用聊天侧既有实现：OpenCode `OpenCodeContextPartSerializer`、Claude `ClaudeCodeQueue`、Codex `CodexAdapter`（local_image 临时文件写系统临时目录且 dispose 清理）、Pi `PiStreamMapper`）；粘贴/拖拽/chip 缩略图/上限 1 张/4MB 白名单；系统提示词图片语义（LaTeX 定界符按锚点形态）；vault 快照零变化审计保持通过。
- 验收：需求文档逐条 + 单测（渐进/严格解析一致性、多标签/未闭合清除、节流）+ 契约测试（四后端 images 序列化、vault 快照无变化）+ 扩展 `scripts/audit/run-aux-query-audit.mjs` 覆盖图片场景。

### 里程碑 A3：架构层（R-A5 + R-A6 + R-A7）
- 子智能体 A3（A2 验收后启动，串行）。本条改动最深，单独一个子智能体。
- R-A5 多片段：`InlineEditWidgets` 状态改按 `editId` 键控（upsert/remove/clearAll，保留 insertion block widget 与 replacement inline replace 语义）；控制器 `active` 改按 EditorView 分桶 Map；`inlineEditMaxConcurrentEdits` 默认 3；焦点归属登记；脏检查交叉安全（测试中显式覆盖）。
- R-A6 全文模式：`InlineEditRequestKind` 增加 document 形态；`<editor_document>` 请求块；`INLINE_EDIT_MAX_DOCUMENT_CHARS`（200k）超限拒绝不分块；单次 `editor.replaceRange` 覆盖整篇（单步撤销）；接受前二次确认；diff 走整段 before/after 降级视图并标注；`inlineEditDocumentModeEnabled` 默认 true；独立命令 `inline-edit-document`。
- R-A7 上下文扩展：picker 多选（行内+聊天一致）、文件夹条目、拖拽支持 vault 内文本文件与文件夹（`getAbstractFileByPath` + instanceof 校验）；`<attached_context>` 区分文件/目录语义；目录计数语义（每条目计 1）；行内上限提示不静默截断。
- 验收：需求文档逐条 + 单测 + 契约测试（装饰集 upsert/remove、交叉接受锚点映射、脏检查互不误伤）。

### 批次 B：领域能力（R-B1…R-B5）
- R-B1 自动内链（子智能体 B1）：后处理层实现（可单测），标题存在性验证（`CachedMetadata.headings`），代码块/已有链接排除，排除词表可配置，`autoInternalLinkEnabled` 默认 false，内链插入在 diff 生成之前（可见可拒绝）。
- R-B2 主题组（子智能体 B1 同一任务或紧随）：设置持久化 `contextGroups`，一键附加、超限明示省略条数、缺失条目跳过并提示。
- R-B3 编辑回退（子智能体 B2）：插件侧快照（后端无关），`.opencodian/checkpoints/` 内容寻址去重，大小/条数上限与淘汰，预快照 ≤200ms 预算否则退化，回退走 `vault.process/modify`，新建文件回退进回收站，回退可再撤销，侧栏入口与能力边界标注，`editRevertEnabled`/`editRevertSnapshotLimitMb`。
- R-B4 Obsidian 原生工具（子智能体 B3）：路线 A 官方 CLI 先行——检测可用性、设置页状态与安装引导、系统提示词/技能注入、不可用如实显示；写类操作纳入 R-B3 快照；高影响操作显式确认；`obsidianToolingMode`。
- R-B5 批量整理（B3 之后）：任务模板（i18n）、强制快照、执行前预览确认；依赖 R-B3/R-B4，不得先于两者。
- B 批次内部可并行度：B1（内链+主题组）与 B2（回退）文件面基本不相交，可并行；B3 依赖 B2 的快照体系，B5 依赖 B3。

### 批次 C：检索与生成（R-C1…R-C6）
- 每条**先出独立设计文档**（`docs/requirements/flowtext-c<N>-design.md`）再实施；设计文档由子智能体起草、主智能体验收。
- R-C1 整库检索：词面优先（复用 memoryRecall 打分思路），显式开关、注入可见可逐条取消、关闭态逐字节回归、后台增量索引、排除规则。
- R-C2 文生图：新写路径（资产+引用）失败语义显式定义，附件目录遵循 `attachmentFolderPath`，纳入 R-B3 快照，凭据走既有密钥路径。
- R-C3 Alt 补全：长驻/预热只读会话的新生命周期契约（设计文档重点），ghost text 用 `Decoration.widget` + `atomicRanges`，Tab 接受单步撤销，首字节 <800ms 实测。
- R-C4 PDF：三期递进；一期文本层（`pdfjs-dist` 按需加载）；二期复用 R-C1 索引栈；三期先做可行性验证，失败则如实降级。
- R-C5 Canvas：JSON 读写走 vault API + R-B3 快照；节点级 AI 编辑先做可行性验证；确定性布局；失败不留半个文件。
- R-C6 外部接口：默认关、127.0.0.1、令牌鉴权、审计日志（redaction）、能力白名单、最小可用。

## 3. 测试与验收协议

### 3.1 每个子智能体交付前必须自证
1. 对应需求的单测/契约测试全部新增并通过（需求 §8.1/§8.2 为最低集合）。
2. `npm run verify` 全绿（lint 0 警告是硬指标）。
3. `npm run check:module-docs` 通过；src 变更后已跑 `npm run graphify:update:src`。
4. 提交到 worktree 分支（commit message 遵循仓库既有 conventional 风格）。

### 3.2 后端端到端（真 CLI 真模型）
- 既有门禁：`node scripts/audit/run-aux-query-audit.mjs`（四后端真机审计，只读证明 + fail-closed）。
- R-A4 落地后该审计必须扩展覆盖图片附件场景；批次 A 每个里程碑结束后跑一次全量审计。
- 聊天侧/回退等后端无关能力需在四后端下各跑一遍关键路径（可用脚本化或实机）。

### 3.3 实机截图验收（主智能体执行）
- 里程碑边界：worktree 内 `npm run build` → 复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css`（及 `dist/assets/` 若涉及）到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/` → 校验 BUILD_ID。
- 用 obsidian-plugin-autodebug 技能连接 Obsidian（CDP），逐条过手动验收清单（需求 §8.3），**每个关键交互必须截图目测**：面板出现位置、菜单渲染、流式预览增长、diff 降级视图、chip 渲染、设置页新项、侧栏回退入口等。
- 截图存档到 worktree `artifacts/opencodian/flowtext-parity/`（按里程碑分目录），作为状态回填的证据来源。
- 前端观感参照 impeccable 技能：Obsidian 原生优先、对比度 ≥4.5:1、键盘全流程、reduced-motion、双语文案；发现视觉缺陷开具返工项。

### 3.4 需求文档回填
- 每条验收通过后把 `flowtext-parity.md` 对应条目状态 TODO→DONE/PARTIAL/WONTFIX 并附证据（commit、截图路径、审计输出）。

## 4. 当前进度

| 里程碑 | 状态 | 证据 |
|---|---|---|
| A1 | 未开始 | |
| A2 | 未开始 | |
| A3 | 未开始 | |
| B | 未开始 | |
| C | 未开始 | |
