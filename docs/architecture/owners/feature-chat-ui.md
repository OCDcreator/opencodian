> 2026-09-21 (advantage-parity R-F2/R-F3/R-F5 质量修复)：会话设置弹窗的绑定字段改为三态保存契约（`undefined` 不回写 / `null` 解绑 / string 显式选择），修复"弹窗打开期间 vault rename 跟随被旧路径覆盖"；Modified Files 的绑定笔记在 revert 与 session-diff 两种模式下都进独立分区并显示排除提示，未命中不再作为裸行混入变更列表；回退预览行数两侧加语义标签并为 created/deleted/moved 增加动作说明；会话 rail 改为具名 landmark（region）且标题具备 heading 语义。
> 2026-09-18 (FlowText parity R-A7): `ContextFilePickerModal` (multi-select + folder rows + attach-N footer) — see the mapped module doc for the contract.
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

# Owner: feature.chat-ui

2026-11-11（二级面板 v2）：终端启动主操作进入空状态，真实 PTY/xterm 生命周期不变；浏览器地址、预览与操作区分离，截图门禁不变，并按参考稿 `session-workbench-secondary-v2.html` 修正呈现：附加页面按钮换用专用短键 `workbench.browser.attachPage`（不复用全局 attach 标签），空状态平静说明与 `invalidUrl` 错误分区，Open 为填充主操作（`:is` 宿主作用域修特异性），32px 圆角地址输入，预览 210px 且状态层绝对覆盖、内容居中，附加/截图为同行 28px 描边按钮，Obsidian 打开与主工作区入口为地址旁仅图标操作且保留 aria 可访问名——均为展示层，运行时契约不变；仓库仅在有快照时显示分支工具头，非 Git/加载/失败状态使用单一路径的状态块。目录计数右对齐，终端 spawn 去掉重复上边框，概览级刷新只在概览显示，所有变化仍属展示层。

2026-11-11（会话工作台展开与仓库打磨）：命令目录稳定挂载到会话引用之后、低频信息之前；信息分组与目录使用单框 disclosure，搜索图标与 32px 输入框固定对齐。仓库头部采用分支/操作与独立路径的两行网格，文件路径仅在展示层拆成文件名和父目录，原始 path、Git 操作与草稿语义不变。`SessionWorkbenchChildView` 隔离子会话转录及续接 composer 的 MarkdownRenderer/Component 生命周期，`SessionWorkbenchInformation.renderChild` 公开入口不变，owner 与原生状态归属不变。

2026-11-11（共享工作台层级重设计）：一级承担单行 Plan 控制、会话文件变更入口、活动／会话终端／引用及内联命令目录；取消重复的任务与命令资源分类跳页。工作区 PTY、仓库及浏览器仍保留独立工作视图，回到一级恢复发起行、展开状态、滚动和焦点。`SessionWorkbenchTools` 持有工具展示草稿、就近错误与延迟目录加载，单向组合 `SessionWorkbenchRepository`，后者完整隔离仓库表单、diff／snapshot 读取代际及暂存／提交／工作树写入口；两者仍在同一 owner 内，不成为任务、权限或仓库状态的第二真值。异步读取按工具及会话身份隔离，目录复用既有 slash 失效信号，关闭视图使迟到读取失效。`ModifiedFilesSidebar` 仅暴露已有权威摘要的只读投影，嵌入工作台时使用 region 语义；会话文件变更不替代为 Git 统计。宿主 PTY 命名为“工作区终端”，原生后台终端命名为“会话终端”。原生操作与子会话续接契约仍由既有 owner 持有。

2026-11-10（工作台子会话续接视图）：`SessionWorkbenchInformation.renderChild` 按 child `mode` 门控——仅 `continuable` 且 capability/probe 允许时挂载内嵌续接 composer（queue/steer 分段 radiogroup 投递选择），one-shot/external/unknown 恒为只读记录并显示只读说明；composer 的值/焦点/光标与投递选择跨面板重绘重建保留，发送中闭包禁用、失败保留草稿；子转录 user 行可见文本复用同一 mask 显示投影（渲染副本脱敏，message 对象与只读转录数据不变，assistant/tool 走上游策略）。子会话视图不提供独立 Stop 按钮且不支持图片续接（content 仅文本）。跨重绘竞态修复已由主代理落地并经 custom+Kimi 复核闭合（真实用例修复前 FAIL、修复后 34 PASS，2026-11-10 通报）：面板 refresh 动作先同步重投影 composer 编辑、再后台权威读取，读取挂起期间新草稿/caret 不丢；续接门与租约复检归 feature.chat-services 协调器，本 owner 只负责视图门控与值/焦点/光标恢复。

2026-11-10（effort 保存焦点局部化）：inline `EffortSelector.selectInlineVariant` 保存期间不再置原生 `disabled`（会触发 Chromium 对已聚焦 range 的强制 blur，丢焦点并翻转 composer `:focus-within` 环），忙态改为 `aria-busy`/`aria-disabled`，`isSaving` 同时拦截 input 预览与 change（挂起期 change 仅回读、不二次保存），保存结束后单次 `updateDisplay()`；单选项保留原生 `disabled`。配套把 shadcn composer focus ring 收窄为 `:focus-within:not(:has(.opencodian-model-dropdown :focus))`（`src/style/base/core.css`），popover 内部焦点不再点亮整卡环。owner 边界与依赖未变。见 `docs/modules/features/chat/ui/EffortSelector.md` 与 `docs/modules/style/base/core.md`。

2026-11-10（effort 标签主机回调）：`EffortSelector` 新增可选 `getVariantLabel`，`labelForVariant()` 收束全部展示路径并在空白时回退内置格式化，任何路径不渲染空标签；仅重命名展示，variant 值与保存语义不变。见 `docs/modules/features/chat/ui/EffortSelector.md`。

2026-11-10（effort 内联滑块填充对齐）：`EffortSelector.syncInlineProgress` 改为输出无单位 clamp 系数，`effort-selector.css` 的 WebKit 填充终点以 `calc(thumb/2 + (100% - thumb) * 系数)` 落在原生 thumb 圆心，修复 28px thumb 下中间档位 ±7px 竖直缝；交互、刻度、is-highest/reduced-motion/forced-colors 契约不变，见 `docs/modules/features/chat/ui/EffortSelector.md` 与 `docs/modules/style/components/effort-selector.md`。

2026-11-10（会话工作台顶边实测）：SessionWorkbench 触发胶囊与打开面板不再用固定 80px 顶边猜测：`syncLayout` 测量 `.opencodian-messages-shell` 上缘（真实 chat chrome 底——换行表头或表头下方页签条）并保留既有 15px 间距写入 `--workbench-top`，宽窄一致；ResizeObserver 同时观察消息区，缺锚点时回退 CSS 默认 80px。

2026-11-10（DSH composer 布局恢复 + phase2 定案）：`DshSessionWorkbenchModal` 已解除接线（dormant）。其唯一入口是用户否决的 DSH composer 按钮条，该按钮条不再挂载，因此运行时没有路径打开此 Modal；文件保留待清理决策。DSH Jobs、子会话、终端 spawn 与独立 Plan 只经既有共享会话工作台呈现——Overview 增加一行 Plan toggle（排队只作 note，从不显示为 active），Tasks 承载终端/子会话通用行、job 操作与折叠 spawn 表单；pending 行操作按 workbench identity + task id 由 surface 计数锁定，重绘重建锁定行、settlement 解锁当前承载同一 task 的行。不提供第二个 DSH 专属界面、侧栏或 CSS family。以下两段仅描述该未接线类（其 pending 发送/草稿契约与共享工作台 phase2 契约一致；跨重绘修复正在落地，暂不作 PASS 记录）。

2026-11-09：`DshSessionWorkbenchModal` 提供当前 Native 会话的 Jobs 输出／等待／停止、受 owner 约束的终端操作、子会话历史和取消入口。所有操作由真实 adapter 能力 gate，异步结果绑定原会话／adapter／请求代际；忙碌、空状态、失败、不可用和待确认均有本地化反馈。输出有界脱敏，终端输入掩码且发送后清空；UI 不把取消请求当作原生终态，不替代 SessionInformationCoordinator 的任务生命周期。

每次刷新先等待可选 `refreshNativeControlCapabilities()`，再消费 adapter 同步当前能力并发送读取；等待后重验原会话／generation，终端扩展重新挂载可通过刷新发现。能力发现未决／失败禁用原生操作，保留本地刷新／设置入口、输出和终端草稿；既有按钮通过动态 predicate 追踪新能力，不重建行、不保留初建时的能力布尔值。此处只持有发现是否成功的 UI 状态，能力真值仍在 adapter。终端发送在清空输入前检查该终端的 send 操作锁；前次发送未决时的新草稿不会因重复点击丢失，signal / kill 保持各自独立操作锁。

2026-11-01：会话信息胶囊保留信息与功能入口；SessionWorkbench 点击任务、文件或工具后直接展示对应标题的卡片，移除四页签导航。SessionWorkbenchTools 移除嵌套工具下拉框，主区域视图也使用当前工具名称。容器仍负责每会话卡片/工具偏好、返回与焦点，底层会话状态和 PTY 生命周期继续由既有 owners 提供。
同日视觉整理：标题/控件保持独立行；信息分组依靠间距区分，任务与工具入口统一单列整行。当前“会话引用”（附件及后端加载来源）与“命令与资源”工具保留各自含义，不把目录入口误称为当前材料列表。

2026-10-29：ModelSelectorRenderer 将提供商分组绘制为带数量的 disclosure，折叠状态由 feature.chat-services 的选择协调器传入；折叠分组不生成模型 option，保留图标、ARIA 关联和 sticky header cleanup。
> 2026-10-26（DSH UI 修复）：EffortSelector 持有菜单焦点、单选语义、展开状态和保存反馈，支持方向键、Home/End、Enter/Space、Escape 与 Tab。保存由既有 host 执行；重复保存受控，失败保留选项和反馈，成功后仅在焦点仍位于菜单时回到入口，保存期间离开或卸载不抢焦。默认/显式 Off 及生效边界文案由 host 提供，组件不解析后端协议。
> 2026-10-24（DSH）：ContextDetailModal 显示原生占用总量；当 tokenBreakdownAvailable 为 false 时隐藏未知分类和费用计算，压缩入口继续遵守后端能力。
> 2026-09-30 (Codex 0.159 integration)：
> - `BackendSessionBrowserDetail`：分页 transcript 路径（`listThreadTurns` 摘要 + load-more 游标追加），保留 legacy 回退与 transcript-unavailable 占位。
> - `ConversationSessionSettingsModal`：移除 codex `'untrusted'` approval 选项。
The modified-files sidebar labels OpenCode 2 file-hint records with unavailable status and line statistics when no native snapshot exists, avoiding a false measured zero.
> 2026-09-24（ZCode）：ContextDetailModal 的 ZCode 用量身份优先显示原生已完成回合的 billing provider/model；下一回合的标签模型选择不能改写历史用量标签。上下文压缩入口继续由当前会话的可用性控制，双语标题使用后端中立文案。
> 2026-09-21 (advantage-parity R-F2/R-F3)：ConversationSessionSettingsModal 提供绑定/解绑与 locked 显示；ModifiedFilesSidebar 将未变更绑定笔记放在独立分区，只有真实 diff 才加关联徽标；EditRevertPreviewModal 显示 before/after 行数与冲突二选一，确认后仍交既有回退服务写回。

Pricing readiness (2026-09-10): ContextDetailModal accepts scoped readiness and pricing callbacks, prices its captured token snapshot instead of copying a newer snapshot's cost, and releases the subscription on close without resetting raw messages or compaction state.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/chat/ui/**`

## Responsibilities
- chat UI components: modals, docks, overlays, model selector, navigation sidebar, lsp indicator

## Entrypoints
- `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-streaming`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-rendering`

## Focused tests
- `tests/unit/features/chat/ui/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Modified-files sidebar:** the sidebar is an explicit, keyboard-accessible current-OpenCode-session `session.diff` viewer. It does not query or imply Git working-tree state.
- **Shared vault path delegation:** `ModifiedFilesSidebar.formatPath()` now delegates to the shared `toVaultRelativePath()` pure function (directory-boundary stripping, traversal rejection, fail-closed `null` for unprovable absolute paths) while keeping its own adapter `getBasePath()` acquisition. Unresolved entries show only a non-interactive basename and never expose/open the raw absolute path.
- **Single tooltip ownership:** an `EffortSelector` custom tooltip trigger must not sit beneath an ancestor `aria-label` or `title` that Obsidian can also adopt as a native hover tooltip. Keep the visible value and custom `data-tooltip` on the concrete control, and preserve its accessible name through `aria-labelledby` plus a visually hidden carrier.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Do not combine a custom tooltip trigger with a native-tooltip-owning `aria-label` or `title` on that trigger or its component-owned ancestor.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
- 2026-09-08：会话设置 UI 暴露 Codex SDK 0.153.4 新推理档位，不改变其“下一线程生效”语义。

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.chat-ui retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

## Model selector provider header icons (2026-09-11)

`RenderModelListOptions` gained a required `app: App`, and provider group headers now call `ProviderIconService.createIconElement(app, provider.id, 14)`. This removed the divergence where `hasIcon()` was true but `getIconUrl()` returned null, and lets local bundled icons render in the dropdown headers. Keep provider icon resolution in `shared.utils-icons`.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

2026-10-02：后端会话浏览器消费 Codex 汇聚目录结果，complete/partial/failed/unavailable 状态显式呈现；本地遗忘确认框说明原生历史保留，未知或混合后端目标不得静默完成。

## 2026-10-05 Codex 消息前分支与恢复

BackendSessionBrowserModal 保留 native user identity 的 resume seed；目录分页与 partial 状态继续由 backend catalog owner 提供。
浏览器/detail seam 仅透传可选的本地 Codex native 引用，缺失 child 的权威读取仍属 backend owner。

## 2026-10-06 Codex catalog permission denial

Codex 会话浏览器从结构化目录结果保留权限拒绝分类，现有 status renderer 只显示固定本地化说明；不改变 session identity、resume/fork 或其他 backend 的列表契约。

2026-10-07: The backend session browser renders the shared catalog evidence, keeping partial data and credential-free failure classifications distinct from empty complete reads.

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.chat-ui` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 2026-10-23 DSH history boundary

会话浏览器为 DSH 的原生 ID 续接显示“此前记录不导入”的说明。原生上下文恢复仍由 core.backend 负责；UI 不把缺少 transcript 能力包装成已导入完整历史，forced backend 继续决定恢复会话的 owner。

## 目录定位（2026-10-23）

当前源码目录：`src/features/chat/ui`、`src/features/chat/ui/modelSelector`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。


2026-10-26 现场 Escape 补充：EffortSelector 暴露 handleEscape()，由宿主 Scope 在捕获阶段调用；组件继续独占 open/focus 状态，document 监听仅作独立组件回退。

2026-10-27 组合模型弹层：EffortSelector 增加 inline presentation，在模型 popover 下半部用真实 backend variants 驱动的离散 slider 呈现；popover presentation 与 handleEscape/focus 语义保留。ContextRing 仅移动到 composer 外状态栏，组件 API 与 modal 触发未变。

2026-10-27 思考强度胶囊样式：EffortSelector 在原生 range 外增加局部 control 容器，装饰圆点按真实 variants 的数量对齐 thumb 中心，当前圆点跟随预览和回读隐藏。header 与 aria-valuetext 继续显示完整档位名，保存、default/inherit/off 及生效边界由原有 host callbacks 决定；未改变 owner 依赖或后端配置职责。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `feature.chat-ui` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## Goal 与会话工作台（2026-10-30）

SessionWorkbench 为 320px 状态胶囊/分组浮层，展开后提供任务、文件和工具详情。SessionWorkbenchTools 与主区域 DesktopView 共享宿主 runtime；工具视图不启动后端自动轮，不把 Git 工作区当成会话修改记录。原生状态、迟到响应和目标输入确认由 SessionWorkbenchCoordinator 负责。

## 会话信息（2026-10-31）

SessionWorkbenchInformation 定义面板 DTO 并渲染信息，子会话转录与续接由同 owner 的 SessionWorkbenchChildView 承担；SessionWorkbench 只管理容器、折叠、滚动与 Goal，依赖保持单向。
- 2026-11-12 (claude-provider-clarity) owner manifest 核对：与基线 1d3fa289 对 architecture-owners.config.json 做程序化逐 owner deep-equal 对比，全仓仅 feature.settings-claude 的 include 纯插入新增 `src/features/settings/backends/claude/SettingsClaudeProviderModals.ts`（无删除、无其他字段变化）；本 owner（feature.chat-ui）的 include、responsibilities、canonical state 与依赖约束逐项对比未变。此为 manifest-diff 核对记录，不构成全量架构评审。
