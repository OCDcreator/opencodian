# Turn Diff Card Compact Layout Implementation Plan

> **交给 KK3 执行。** 实现时必须使用 `tdd`、`obsidian-plugin-autodebug` 和 `superpowers:verification-before-completion`；遇到与本文预期不一致的运行时行为时，再使用 `diagnosing-bugs`。按复选框推进并保留每个门禁的原始证据。

**Goal:** 把 OpenCode 的 Turn Change Record（“本轮修改了这些文件”）渲染成紧凑、可辨认、可操作的单行文件列表，同时不改变其他 warning/error/info notice，也不破坏现有持久化和 Session Change Sidebar 同步。

**Architecture:** `AssistantNoticeCardRenderer` 通过 `getTurnDiffNoticeMeta(message)` 对有效 turn-diff notice 走专用结构化 DOM 分支；普通 notice 继续走现有 icon + Markdown 分支。文件路径从 immutable `noticeMeta.entries` 读取，使用共享的 vault-relative 规范化逻辑；打开文件等 Obsidian 副作用继续由 `OpenCodianView` 的窄 host seam 提供。`message.content` 与旧 Markdown 只承担持久化/兼容职责，不作为新卡片的 DOM 数据源。

**Tech Stack:** TypeScript、Obsidian DOM API、Jest/jsdom、CSS、OpenCodian i18n、CodeGraph 1.5、Graphify、真实 Obsidian Test Vault。

---

## 1. 背景与当前问题

当前通用 notice renderer 会无条件创建 `.opencodian-chat-notice-icon`，并把 turn-diff 的 Markdown 内容直接渲染为正文。因此现有卡片存在以下问题：

- 左侧 info/叹号图标占用窄侧栏中的横向空间。
- 标题下重复显示“OpenCode 报告本轮变更涉及以下文件：”。
- Markdown 列表把绝对路径显示成多行红色链接，例如 `/Volumes/.../testvault/...`。
- 文件名、父目录、状态和增删统计没有适合窄侧栏的信息层级。
- 多文件场景会让卡片过高。

本任务只改变有效 `turn-diff` notice 的视觉与交互。此前修复的 notice 持久化、canonical/server sync 排序和 Session Change Sidebar 刷新逻辑必须保持不变。

## 2. 已确认的产品契约

### 2.1 卡片结构与密度

- 只从 Turn Change Record 卡片删除左侧 info/叹号图标及其占位。
- warning、error、普通 info、OMO notice 的图标、DOM 和行为保持原样。
- 标题显示“本轮修改了这些文件”以及一个文件数量徽标；徽标可只显示数字，必须有本地化的可访问名称。
- 不再渲染重复说明“OpenCode 报告本轮变更涉及以下文件：”。
- 卡片左右 padding 为 `16px`，上下 padding 为 `14px`。
- 标题与文件列表间距为 `10px`。
- 文件行目标高度约 `30px`，相邻行间距为 `4px`。
- 保留现有卡片边框和圆角；不要在卡片内再嵌套第二层卡片。

### 2.2 文件路径

- 每个文件严格占一行，不允许路径、状态或统计换行。
- 展示值必须是 vault 相对路径，不能出现 `/Volumes/.../testvault/...`、Windows drive 前缀或反斜杠绝对路径。
- Tooltip 显示完整 vault 相对路径，不能重新泄露主机绝对路径。
- 先做语义压缩，再让 CSS 做最后的宽度保护：
  - 根目录长文件名示例：`OpenCodian-QA-sidebar-…-20260803.md`
  - 深层路径示例：`custom/…/导数模型.md`
  - 深层路径保留首个父目录和完整/压缩后的文件名，中间目录统一为 `…`。
  - 长文件名采用中间省略，必须保留可辨认的开头、末尾和扩展名；禁止只用尾部 `text-overflow: ellipsis` 把扩展名裁掉。
- 父目录使用弱化颜色；文件名使用正常亮度和略高字重。

### 2.3 行交互、状态与统计

- 整行是一个可聚焦的原生交互元素，点击可打开 vault 文件。
- Enter 必须能打开文件；保留清晰的 `:focus-visible`，并避免重复触发。
- 常态不显示下划线；hover 时只做轻微背景高亮，不做位移或重阴影。
- 行右侧始终显示两个轻量统计徽标，包括 `+0` 和 `−0`：
  - `+N`：绿色文字 + 极淡绿色背景。
  - `−N`：红色文字 + 极淡红色背景。
  - 小圆角、等宽数字、无阴影、无重边框。
- `modified` 不显示状态文字。
- `added` 显示“新增”小标签；`deleted` 显示“删除”小标签。
- 当前 `SessionDiffEntry.status` 只有 `added | deleted | modified`。不要为本任务擅自扩展类型或 normalization。
- 可在 CSS/内部映射边界预留 `.status-renamed` 的视觉规则，但不得伪造 renamed 数据。只有确认上游当前真实返回 renamed，并同时完成 type、normalization、persistence 和测试后，才允许把它纳入本任务。

### 2.4 折叠行为

- 默认最多显示 5 个文件。
- 第 6 个开始隐藏，并显示“展开其余 N 个文件”按钮。
- 展开后显示全部文件并提供“收起”按钮；不要使用卡片内部滚动条。
- toggle 使用 `aria-expanded` 和 `aria-controls`，可键盘操作。
- 展开状态只属于当前 card DOM；conversation reload、Obsidian reload 或重新渲染后恢复默认 5 行。
- 不把展开状态写入 conversation、settings、storage 或 `noticeMeta`。
- toggle 后调用现有 `handleCollapsibleToggle` seam，让滚动补偿逻辑保持有效。

## 3. 非目标与禁止事项

- 不修订或泛化 notice persistence/canonical rebase 算法。
- 不改变 `appendTurnDiffNoticeIfNeeded()` 的去重、持久化顺序和 sidebar refresh 时机。
- 不把结构化 UI 重新序列化进 `message.content`。
- 不通过标题文案或 Markdown 正则猜测 turn-diff；只信任 `getTurnDiffNoticeMeta(message)`。
- 不删除通用 `.opencodian-chat-notice-icon`，不全局改变 generic notice 的 flex/gap。
- 不让 `AssistantNoticeCardRenderer` 直接依赖 `App`、workspace 或完整 `OpenCodianView`。
- 不创建只被一处使用的薄 helper/module；vault path 逻辑应扩展现有 `src/shared/vault.ts`，而不是另建新文件。
- 不增加依赖，不使用 `as any`、`@ts-ignore` 或 `@ts-expect-error`。
- 不修改 `reference-projects/`。
- 不在本任务中更新版本号、提交或推送，除非用户随后明确要求。

## 4. 推荐 DOM 与数据流

有效 turn-diff 的建议结构如下；类名可做小幅调整，但层级和可访问性不可弱化：

```text
.opencodian-chat-notice-card.is-info.is-turn-diff
└─ .opencodian-chat-notice-body
   ├─ .opencodian-turn-diff-header
   │  ├─ .opencodian-chat-notice-title
   │  └─ .opencodian-turn-diff-count
   ├─ .opencodian-turn-diff-list
   │  ├─ button.opencodian-turn-diff-row.status-modified
   │  │  ├─ .opencodian-turn-diff-path
   │  │  │  ├─ .opencodian-turn-diff-parent
   │  │  │  └─ .opencodian-turn-diff-filename
   │  │  └─ .opencodian-turn-diff-meta
   │  │     ├─ optional .opencodian-turn-diff-status
   │  │     ├─ .opencodian-turn-diff-stat.is-additions
   │  │     └─ .opencodian-turn-diff-stat.is-deletions
   │  └─ ...
   └─ button.opencodian-turn-diff-toggle
```

数据流必须是：

```text
ChatMessage
  -> getTurnDiffNoticeMeta(message)
  -> immutable noticeMeta.entries
  -> vault-relative normalization
  -> compact presentation label + full relative tooltip
  -> host.openVaultFile(relativePath)
```

无有效 meta 时继续使用当前 generic notice renderer，不做内容启发式识别。

## 5. 预计文件清单

| 文件 | 预期责任 |
| --- | --- |
| `src/features/chat/runtime/AssistantNoticeCardRenderer.ts` | 增加 turn-diff 专用 DOM renderer，保留 generic 分支。 |
| `src/features/chat/OpenCodianView.ts` | 为路径解析和打开 vault 文件提供窄 host seam。 |
| `src/shared/vault.ts` | 增加纯函数形式的跨平台 vault-relative 路径规范化；不要破坏现有 `getVaultBasePath()`。 |
| `src/shared/index.ts` | 导出共享路径函数。 |
| `src/features/chat/ui/ModifiedFilesSidebar.ts` | 让现有 `formatPath()` 委托给同一共享路径函数，保持 sidebar 行为一致。 |
| `src/style/features/chat-assistant.css` | 只在 `.is-turn-diff`/专用 namespace 下实现布局、行、徽标、状态和折叠样式。 |
| `src/i18n/locales/en.ts`、`zh.ts` | 数量、展开/收起、状态和无障碍文案。旧 description 可保留供 persisted Markdown 兼容。 |
| `tests/unit/features/chat/AssistantNoticeCardRenderer.test.ts` | 专用 DOM、generic 回归、交互与折叠测试。 |
| `tests/unit/features/chat/ModifiedFilesSidebar.test.ts` | 共享路径接入后的 sidebar 回归。 |
| `tests/unit/shared/vault.test.ts` | 如当前不存在则创建，覆盖跨平台路径规范化。 |
| `tests/unit/features/chat/AssistantNoticeCardRendererStyleContract.test.ts` | 如无等价覆盖则创建，锁定单行、专用作用域和徽标样式。 |
| `docs/modules/features/chat/runtime/AssistantNoticeCardRenderer.md` | 记录专用分支和 host seam。 |
| `docs/modules/features/chat/ui/ModifiedFilesSidebar.md` | 记录共享路径规则。 |
| `docs/modules/shared/vault.md` | 记录纯路径函数契约。 |
| `docs/modules/style/features/chat-assistant.md` | 记录 turn-diff CSS namespace 和交互。 |
| `styles.css` | 由 `npm run build` 自动生成，不手工维护。 |

`ConversationNoticeCoordinator.ts` 和 `src/core/types/chat.ts` 原则上不需要修改。若 KK3 发现必须修改，先解释原因并重新跑对应 symbol 的 CodeGraph；不得借机改 persistence 或扩展 status 类型。

---

## 6. Task 0：仓库、owner 与 CodeGraph 预检

- [ ] 阅读仓库 `AGENTS.md`、`graphify-out/GRAPH_REPORT.md` 和本文。
- [ ] 运行 `git status --short --branch`，保留用户已有改动，不覆盖、不回滚。
- [ ] 解析 owner：

```bash
npm run inspect:owner -- src/features/chat/runtime/AssistantNoticeCardRenderer.ts
npm run inspect:owner -- src/features/chat/OpenCodianView.ts
npm run inspect:owner -- src/features/chat/ui/ModifiedFilesSidebar.ts
npm run inspect:owner -- src/shared/vault.ts
```

- [ ] 修改任何已有 function/class/method 前，按 `AGENTS.md` 运行 CodeGraph `callers` 和有限深度 `impact`。至少检查：
  - `AssistantNoticeCardRenderer::render`
  - `OpenCodianView::createAssistantNoticeCardRendererHost`
  - `ModifiedFilesSidebar::formatPath`
- [ ] `impact` 使用明确有限的 `depth=2`。记录每个 symbol 的直接 function/method callers 数和 blast-radius size；排除 file node。
- [ ] 若同名 symbol 解析出多个定义，先用 query/file 限定并验证 root file；若 depth 2 已越过本任务边界，停止修改并回报用户，不要猜。

## 7. Task 1：先写失败测试（RED）

### 7.1 路径测试

- [ ] 为共享纯函数写测试，至少覆盖：
  - macOS vault 内绝对路径 -> vault 相对路径。
  - Windows drive + 反斜杠 -> `/` 分隔的 vault 相对路径。
  - 已经是相对路径 -> 保持语义不变并统一分隔符。
  - vault 前缀碰撞（如 `/vault` 与 `/vault-two`）不能错误剥离。
  - 完整相对路径可供 tooltip/open 使用；compact label 不得回流到打开文件的参数。
- [ ] 在 `ModifiedFilesSidebar.test.ts` 锁定它仍使用同一相对路径结果。

### 7.2 Turn-diff renderer 测试

- [ ] 构造含有效 `noticeMeta.kind = 'turn-diff'`、长绝对路径、至少 6 个 entries 的 `ChatMessage`。
- [ ] 断言专用卡片有 `.is-turn-diff`，没有 `.opencodian-chat-notice-icon`。
- [ ] 断言标题存在、数量徽标正确，`renderMarkdownInto` 没有被调用，重复 description 不存在。
- [ ] 断言每个文件只有一个原生 button 行，路径与右侧 meta 同行。
- [ ] 断言展示和 tooltip 都不包含 vault 绝对根；tooltip 等于完整 vault 相对路径。
- [ ] 断言根目录长文件名和深层路径分别满足中间压缩示例；扩展名保留。
- [ ] 断言父目录/文件名有独立 class，便于视觉层级验证。
- [ ] 断言 `+0`、`−0` 仍显示；正数也显示正确。
- [ ] 断言 modified 无状态标签，added/deleted 有本地化标签。
- [ ] 断言默认只有前 5 行可见；toggle 文案中的 N 正确。
- [ ] 断言展开后全部可见、`aria-expanded=true`；收起后恢复 5 行且不写 message/meta。
- [ ] 点击任意行时，host 只收到完整 vault 相对路径，不收到 compact label 或绝对路径。
- [ ] 断言行是可聚焦原生控件；在真实 Obsidian 阶段验证 Enter。不要为了 jsdom 测试增加可能导致浏览器双触发的多余 keydown handler。
- [ ] 保留并扩展 generic warning 测试：warning icon、Markdown body、action 必须仍正常。
- [ ] 增加 generic error/info 或 OMO 回归，证明专用分支没有吞掉其他 notice。

### 7.3 CSS contract 测试

- [ ] 锁定专用 selector 至少包含：单行 `white-space: nowrap`、`min-width: 0`、overflow 保护、约 `30px` 行高、`4px` gap、hover、`:focus-visible`、绿色/红色统计背景、`font-variant-numeric: tabular-nums`。
- [ ] 断言没有全局隐藏 `.opencodian-chat-notice-icon` 的规则。
- [ ] 断言不增加内部滚动条、重阴影或第二层卡片边框。

- [ ] 运行 focused tests 并保留失败输出；测试必须因缺少新行为而失败，不得通过错误断言制造 RED：

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/AssistantNoticeCardRenderer.test.ts \
  tests/unit/features/chat/ModifiedFilesSidebar.test.ts \
  tests/unit/shared/vault.test.ts \
  tests/unit/features/chat/AssistantNoticeCardRendererStyleContract.test.ts
```

如果最终没有创建其中某个新测试文件，从命令中移除它并说明由哪个等价测试承接覆盖。

## 8. Task 2：实现共享 vault-relative 路径边界（GREEN 1）

- [ ] 在现有 `src/shared/vault.ts` 中增加纯函数，不创建新 helper 文件。
- [ ] 纯函数接收 `filePath` 与 `vaultBasePath`，统一 `/`、`\`，只在目录边界真实匹配时剥离 vault root。
- [ ] 保留用于打开文件的完整相对路径；compact 显示是 renderer 的 presentation 责任。
- [ ] 对无法证明位于 vault 内的绝对路径 fail closed：不得把主机绝对路径写进新卡片 DOM 或 tooltip。可以回退到 basename 并将该行标记为不可打开，或返回显式 unresolved 结果；选择一种并写测试，不得静默把外部绝对路径当 vault link 打开。
- [ ] `ModifiedFilesSidebar.formatPath()` 委托给该函数，同时保留当前 adapter/base path 获取行为。
- [ ] 在 `src/shared/index.ts` 导出函数，更新 `docs/modules/shared/vault.md` 和 `ModifiedFilesSidebar.md`。
- [ ] 跑路径与 sidebar focused tests，确认 GREEN。

## 9. Task 3：实现 turn-diff 专用 renderer（GREEN 2）

- [ ] 在 `render()` 最前面调用 `getTurnDiffNoticeMeta(message)`。
- [ ] meta 有效时进入 `renderTurnDiffNotice(...)` 并 return；meta 无效时完整保留现有 generic 实现。
- [ ] 专用分支直接读取 frozen `meta.entries`，不解析 `message.content`。
- [ ] 专用分支不创建 icon DOM，也不调用 `setIcon()`。
- [ ] 在 host 增加最窄能力：解析展示用 vault-relative 路径、打开 vault 文件。真实副作用由 `OpenCodianView.createAssistantNoticeCardRendererHost()` 接线。
- [ ] 行使用原生 `button type="button"` 或语义等价的原生控件，整行触发 `openVaultFile(fullRelativePath)`。
- [ ] 实现 deterministic compact label：
  - 深层目录只保留第一段 + `…/` + 文件名。
  - 长文件名做中间省略，保留可辨认前缀、末尾和扩展名。
  - CSS grid/flex 用 `minmax(0, 1fr)`/`min-width: 0` 做窄宽兜底，但不能仅靠尾部 ellipsis。
- [ ] 统计徽标无条件渲染；状态标签只渲染 added/deleted。
- [ ] 默认 5 行；第 6 行起用 DOM-local state 隐藏。toggle 同步 `hidden`/class、文案、`aria-expanded` 和 `aria-controls`。
- [ ] toggle 后调用 `handleCollapsibleToggle?.()`；不要持久化状态。
- [ ] 更新英/中文 i18n。建议新增而不是复用含义不准的 key：
  - 文件数量可访问文案。
  - 展开其余 N 个文件。
  - 收起。
  - 新增、删除。
- [ ] `chat.diffNotice.description` 可继续保留，供旧 persisted Markdown/导出兼容；只停止在专用 DOM 分支渲染它。
- [ ] 跑 renderer focused tests，确认 GREEN。

## 10. Task 4：实现专用 CSS（GREEN 3）

- [ ] 所有新增规则放在 `.opencodian-chat-notice-card.is-turn-diff` 或 `.opencodian-turn-diff-*` namespace 下。
- [ ] 专用卡片 body 占满可用宽度，不继承被 icon gap 留出的空白。
- [ ] 使用既有语义变量：
  - additions：`--opencodian-status-success` / `--opencodian-status-success-subtle`
  - deletions：`--opencodian-status-error` / `--opencodian-status-error-subtle`
- [ ] 徽标小圆角、无阴影、弱背景、tabular/monospace 数字；不要加入重边框。
- [ ] 行 hover 只加轻背景，focus-visible 有足够对比度。
- [ ] 保证父目录可收缩，文件名优先可见，meta 不换行也不被挤成两行。
- [ ] 不改变 generic `.is-warning`、`.is-error`、`.is-info` 的 icon 规则。
- [ ] 运行 CSS contract 与 renderer tests。

## 11. Task 5：模块文档、Graphify 与自动化门禁

- [ ] 更新所有受影响的 module docs；如果实际新增/删除/重命名 source module，再同步 module index。
- [ ] 运行受影响范围检查：

```bash
git diff --name-only --diff-filter=ACMR | ./node_modules/.bin/codegraph affected --stdin --path . --json
```

- [ ] source 改动后刷新 committed graph：

```bash
npm run graphify:update:src
```

- [ ] 依次运行并保留结果：

```bash
npm run lint
npm run typecheck
npm run check:module-docs
npm run check:graphify
npm run verify
npm run build
```

要求：lint 为 `0 errors / 0 warnings`，所有命令退出码为 0。不得用 focused tests 代替 `npm run verify`。

## 12. Task 6：Test Vault 顺序部署

本任务触及 runtime/style，build 成功后必须部署到：

`/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`

build 与 copy 必须是分开的顺序步骤，禁止 `&&`，禁止并行复制/验证。

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

- [ ] 从 build 输出/`dist/main.js` 提取最新 `BUILD_ID`。
- [ ] 验证已部署 `main.js` 包含完全相同的 `BUILD_ID`。
- [ ] 记录 dist 与 Test Vault 三个文件的 SHA-256；同名文件必须逐一一致。

## 13. Task 7：真实 Obsidian + OpenCode 后端验收

必须使用 `obsidian-plugin-autodebug` 技能操作真实 Test Vault；截图不能替代 DOM/行为证据。

### 13.1 真实一文件链路

- [ ] Reload OpenCodian，明确选择 **OpenCode backend**，不能用 Codex/Claude 代替。
- [ ] 在 Test Vault 准备一个专用 QA Markdown 文件，例如 `OpenCodian-QA-turn-diff-card-20260804.md`。
- [ ] 通过 OpenCodian 对话要求 OpenCode 实际修改该文件中的唯一 QA marker；记录修改前后内容或 hash。
- [ ] 等待该轮完整结束，确认 Turn Change Record 卡片出现，Session Change Sidebar 同步出现该文件。
- [ ] 等待一次 authoritative sync/reload，再确认卡片和 sidebar 都没有消失。

### 13.2 六文件折叠链路

- [ ] 使用可重复的测试 fixture 或真实记录生成至少 6 个 entries，包含：
  - 一个很长的 vault 内绝对路径输入。
  - 一个深层中文路径。
  - `modified`、`added`、`deleted`。
  - 至少一个 `+0 −0`。
- [ ] 初始截图 + DOM 证明：无 info icon、标题数量正确、仅 5 行可见、每行单行、无绝对路径、路径中间省略、徽标/状态正确。
- [ ] 展开后截图 + DOM 证明：全部行可见、文案/`aria-expanded` 正确、无内部滚动条。
- [ ] 点击一行并用键盘 focus + Enter 各测试一次打开文件；证明打开的是完整相对路径对应文件，而不是 compact label。
- [ ] 收起后 reload conversation/Obsidian；证明恢复默认 5 行，同时卡片仍存在。
- [ ] 触发或找到一张 generic warning/error notice；证明其左侧 icon 仍存在且正文/action 正常。
- [ ] 检查 console：没有新增 error、unhandled rejection、重复打开或无效 vault link。

### 13.3 最低 DOM 证据

回报中至少提供以下实际值，而不是只写“正常”：

- `.is-turn-diff .opencodian-chat-notice-icon` 数量。
- turn-diff row 总数、初始可见数、展开可见数。
- 第一行的 `textContent`、`title`、tagName/type、computed `white-space`、bounding rect 高度。
- additions/deletions badge 的文字、color、background-color、font variant/family。
- toggle 的文字、`aria-expanded`、`aria-controls`。
- generic warning/error card 的 icon 数量。
- card 与 sidebar 在 reload 前后的存在数量。

## 14. Done Checklist

- [ ] Turn-diff 无 info icon；generic notice 无回归。
- [ ] 标题 + 数量徽标正确，无重复 description。
- [ ] 每文件一行，vault-relative，中间压缩，tooltip 为完整相对路径。
- [ ] 整行点击与 Enter 打开正确文件。
- [ ] `+N`/`−N` 含零值始终显示且有区分样式。
- [ ] modified 无标签，added/deleted 有标签；未擅自扩展 renamed 数据模型。
- [ ] 默认 5 行，可展开/收起，无内部滚动，reload 后恢复折叠。
- [ ] Session Change Sidebar 继续即时更新；authoritative sync/reload 后卡片不消失。
- [ ] Focused RED/GREEN、lint、typecheck、module docs、Graphify、`npm run verify`、build 全绿。
- [ ] Test Vault BUILD_ID 与三个 SHA-256 一致。
- [ ] 真实 OpenCode 后端一文件修改通过；六文件 DOM/截图/键盘/console 证据齐全。
- [ ] 未提交、未推送、未更新版本号。

## 15. KK3 最终回报格式

```markdown
## Outcome
- 是否完成，以及是否存在剩余风险

## Changed Files
- 路径：职责/改动

## CodeGraph
- symbol：direct function/method callers = N；impact depth = 2；blast radius = N
- affected 输出摘要

## TDD Evidence
- RED：命令、失败原因
- GREEN：命令、通过 suites/tests

## Full Gates
- lint：...
- typecheck：...
- module docs：...
- graphify：...
- npm run verify：...
- build：...

## Deployment
- BUILD_ID：...
- dist/Test Vault SHA-256：...

## Real Obsidian / OpenCode Evidence
- 实际修改的 QA 文件与 before/after 证据
- 卡片/侧栏在 sync 与 reload 前后的状态
- DOM/computed-style 数值
- collapsed/expanded/generic-notice 截图绝对路径
- console errors：...

## Scope
- 明确确认：未提交、未推送、未更新版本号
```
