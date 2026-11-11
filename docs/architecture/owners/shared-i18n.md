# Owner: shared.i18n

2026-11-11（工作台层级与工具反馈）：双语区分“待办计划”、独立 Plan 模式、“工作区终端”与原生“会话终端”；文件变更使用直接入口，命令与技能使用可搜索内联目录，相关设置单独命名。补齐终端启动／退出／失败、仓库不可用／非仓库／读取失败、差异、浏览器加载及截图条件、目录加载／空列表／无匹配／失败文案。浏览器文案按参考稿 `session-workbench-secondary-v2.html` 修正：附加页面改用专用短键 `workbench.browser.attachPage`（附加页面 / Attach page），不再复用全局 attach 标签；新增平静空态说明 `workbench.browser.emptyDescription` 与 `loading`/`captureWait`/`captureFailed`，与进错误区的 `invalidUrl`、`openFallback` 分开；`workbench.browser.external`（在 Obsidian 中打开）保留为仅图标操作的可访问名。翻译层不推断能力、任务终态或权威文件计数；两侧键名与插值保持一致，旧目录键保留以兼容现有消费方。

2026-11-10（DSH 官方权限名称）：新增 `chat.dsh.permission.*` 四项双语名称，仅供共享权限菜单展示内置预设。自动审查文案不代表后端已启用实验扩展；可用项与选中值由原生目录和会话状态决定，custom host 名称保留。

2026-11-10（DSH 会话后续）：双语补子会话 queue／steer、只读与续接能力、明确拒绝和未确认投递、@subagent 分组、DSH 事件账本时间来源，以及超过图片展示数量的提示。翻译层不把 inbox 接受称为执行完成，也不把传输失败称为确定未发送；保持 messageId／number 等插值名一致。

2026-11-10（DSH 思考档位标签）：`chat.dsh.reasoning.modelDefault` → “继承默认（{effort}）” / "Inherit default ({effort})"；boundaryHint 双语说明继承跟随 DSH 默认强度，`chat.effort.disabled`（关闭思考 / Thinking disabled）为显式关闭、不随默认变化。未新增 key，双语 key 集合与占位符一致。

2026-11-10（DSH 共享工作台 phase2）：双语新增 `workbench.planMode.*` 与 `workbench.nativeTerminal.*`，扩展 `chat.dsh.controls.*` / `chat.dsh.workbench.*`，覆盖共享工作台的独立 Plan toggle、终端 spawn 表单、终端/子会话/job 行操作与非渲染 preset owner 的诚实状态（ACP 不可用／检查中／忙碌／失败）。翻译层只命名状态与动作，不判断运行时真值；中英文 key 集合经 hash 校验一致。

2026-11-09（连接备份组件）：DSH专用 `settings.dsh.backup.*` 同步双语任务名称、空／已备份时间、单份覆盖、字段范围与排除项，以及保存／恢复进度、失败回滚和生效边界。时间沿用 `{{date}}` 占位符。只描述设置owner提供的快照事实，不把备份成功表述为连接测试通过；其他后端共享文案保持。

2026-11-09（DSH A）：双语同步精简连接说明与状态文案，沿用现有横向子标签和插件下拉控件。`settings.agent.dsh.connection.{application,saved}` 明确自动保存到当前库、下次连接时生效；`settings.agent.dsh.path.required` 提示填写空自定义路径或恢复自动查找／当前库。保存反馈与当前连接的应用、运行时确认保持区分，后端状态仍由对应 owner 提供。

2026-11-07：六后端任务页共享保存位置、生效边界、默认值和回退消息，并补齐各后端的选项后果与无 CLI/无账户提示。语言层仅展示 owner 提供的事实，不推断凭据有效、后端已确认或权限隔离强度。未知旧值保留为明确的当前选项，技术标识与数值占位符在双语改写中保持不变。

2026-11-02：ZCode 任务设置页补齐账号隔离、共享 API、登录生命周期、模型目录恢复和配置冲突的中英文文案。子标签迁移保留原配置；状态文案区分文件保存、目录读取与重连后的生效。

2026-11-01：中英文新增 `workbench.information`，以会话信息命名入口；具体功能卡片复用任务、文件、终端、仓库、浏览器和资源标签。翻译层继续只提供名称，不参与卡片选择或后端运行状态判断。
同日澄清上下文文案：会话引用指当前附件及后端加载来源；命令与资源指目录和资源操作入口，双语同步保持这一区别。

2026-10-29：同步 `/` 菜单“命令”“技能”折叠分类标题；分类状态与实际条目由聊天菜单 owner 决定。

2026-10-29：中英文同步统一 `@` 的文件／会话／插件／资源／代理分组及加载、空目录、无匹配和失败状态。翻译文案不推断后端能力；未接通目录由运行时层隐藏。
> 2026-10-26（DSH UI 修复）：中英文目录同步输入框名称、effort 保存失败、DSH 模型默认/显式 Off/下一轮生效，以及 MCP 草稿与已保存声明的区别。翻译层只提供消息表，不承担原生配置生效或在线状态判断。
> 2026-10-24（DSH）：中英文同步提供 MCP 声明保存、原生默认值读取、图片握手状态与协议限制说明；会话模型/推理编辑入口统一指向聊天工具栏。
> 2026-09-30 (Codex 0.159 integration)：locale parity 保持（两侧各 5868 键）；新增 `chat.toolCard.image.*`（4 键）、`chat.backendSessions.detailLoadMore`/`detailLoadMoreRetry`/`detailTranscriptUnavailable`、`settings.codex.tab.plugins` + plugins 分节 + usage 文案；两侧同步移除 `settings.codex.approvalPolicy.untrusted`。
> 2026-09-25 (FA880): Native ZCode background task statuses and cancel action have matching English and Chinese labels.
> 2026-09-25 (FA880): Both locales identify a terminal ZCode permission ask without implying that approval was sent.
> 2026-09-25 (ZCode acceptance): The unavailable modified-files panel copy is backend neutral in both locales; it no longer says a ZCode conversation is waiting for OpenCode.
> 2026-09-24 (票 06)：zh/en 同步新增 settings.zcode.model/thinking/mode 九键。
> 2026-09-22（二轮核查修复）：zh/en 同步新增 `settings.zcode.status.providerValidatedNoCount`。
> 2026-09-22 (ZCode 票 01)：zh/en 同步新增 `settings.agent.name.zcode`、`settings.agent.zcode.desc` 与 `settings.zcode.*`（连接页、运行时覆盖、重连、运行时/provider 配置/连接三行诚实诊断文案）。zh/en 键集一一对应。
> 2026-09-21 (advantage-parity R-F2/R-F3/R-F6 质量修复)：绑定笔记说明改为诚实能力表述（用于快照/回退跟踪/Modified Files 关联，不发送给模型、不自动写回）；回退预览行数改为带标签两侧并新增按状态动作说明（created 删除 / deleted 恢复 / moved 重命名回原路径 / modified 恢复本轮前内容）；新增 Vim 重复键提示。zh/en 键集一一对应。
> 2026-09-21 (advantage-parity R-F2–R-F6)：zh/en 同步新增绑定笔记/locked、回退预览与冲突、聊天空预热、会话 rail 和可配置 Vim 导航文案；预热零 prompt/turn、绑定笔记非自动写回、冲突覆盖风险均在 UI 文案中如实说明。
> 2026-09-21 (advantage-parity R-F7)：`envDomains.changedNotice` 与 `settings.envDomains.*` 键。
> 2026-09-21 (advantage-parity R-F8)：settings.contextWindowOverride.* 键。
> 2026-09-21 (advantage-parity R-F1)：chat.queue.* 键。
> 2026-09-21 (advantage-parity R-F9)：chat.context.fileMenu.attach 键。
> 2026-09-21 (advantage-parity R-E4)：semanticRetrieval 徽标与设置键。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E6)：tokenCount.* 键。
> 2026-09-21 (advantage-parity R-E2)：chat.webViewer.* 键。
> 2026-09-21 (advantage-parity R-E1)：zh/en 新增 chat.context.kind.url 与 chat.context.url.* 键。
> 2026-09-20 (advantage-parity R-D1)：zh/en 新增 chat.history.export、chat.export.*、settings.conversation.export.* 键（双语对齐）。

2026-09-10: update-install phase labels, failure state, completed-file counts and release-history disclosure controls are translated in English and Chinese; no synthetic download percentages.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): en/zh gained settings.conversation.memory.* and commands.memory.* keys.
- 2026-09-18 (FlowText parity R-A1/R-A2): en/zh gained the inline-edit trigger/hotkey/preset-management settings strings, the six builtin preset catalog entries (`inlineEdit.presets.{expand,condense,translate,summarize-table,polish-tone,fix-typos}.{label,prompt}`) and `inlineEdit.presetMenu.empty`.

- **Layer:** `shared` (may import layers: shared)
- **Risk:** low
- **Include:** `src/i18n/**`

## Responsibilities
- locale catalog and i18n message table
- translation key surface consumed by chat and settings

## Canonical state (truth home)
- i18n message catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/i18n/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.foundation`

## Focused tests
- `tests/unit/i18n/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Recent change notes

- **Turn-change record preference:** added English and Chinese labels explaining that the Conversation setting hides or restores historical file-change cards without stopping their collection or retention.

- **Turn-diff compact card copy:** added `chat.diffNotice.fileCount` / `expandRemaining` / `collapse` / `statusAdded` / `statusDeleted` (en + zh) for the structured turn-diff card; `chat.diffNotice.description` stays for persisted Markdown compatibility but is no longer rendered by the dedicated branch.

- **Obsidian 1.13.4 compatibility (Phase B):** added `settings.searchDesc` (en + zh) — the description consumed by `OpenCodianSettingTab.getSettingDefinitions()`'s declarative `SettingDefinitionPage`, so the plugin is discoverable by name and description in global Settings search on Obsidian 1.13+. Module-doc changelog entries added to `docs/modules/i18n/locales/{en,zh}.md`.
- 2026-09-08：中英文 locale 同步新增 Codex `max`、`ultra`、`persistent` 推理档位标签。

## Pi owner boundary review (2026-09-08)

English and Chinese Pi settings copy describe the external CLI, connection check, model defaults and actual extension-dialog behavior.

## Auto-install startup update copy (2026-09-09)

中英文 locale 同步新增 `settings.pluginUpdate.autoInstallToggle` / `autoInstallToggleDesc` / `autoInstallSuccess` / `autoInstallFailure`，覆盖启动自动安装开关说明与成功/失败提示。

## Builtin icon picker library label (2026-09-11)

中英文 locale 同步新增 `settings.model.iconCache.builtinPicker.library.modelsdev`（`models.dev`），对应内置图标选择器库过滤下拉新增的 models.dev 图标来源。
- 2026-09-13: 新增 `settings.conversation.memory.externalRootName/externalRootDesc`（en/zh 同步）。

- 2026-09-15: 新增 `inlineEdit.*`（命令名、placeholder、接受/拒绝、提示与全部错误原因）与 `settings.inlineEdit.*`（设置分节、覆盖项校验、计费说明）两组 zh/en 文案。
- 2026-09-17: 新增 `inlineEdit.context.*` 与三条 `inlineEdit.error.{tooManyAttachedNotes,attachedNotePathTooLong,attachedNotePathInvalid}` 文案（zh/en）。
- 2026-09-17: 新增 `settings.pi.tab.mcp` 与 `settings.pi.mcp.*` 一组（zh/en）：只读说明（列 Pi 合并读取的配置文件与同名覆盖规则）、空态/未声明端点/已禁用/exclusive、传输方式与认证方式标签、来源标签、以及「Pi 最近一次上报」区块（说明/空态/接收时间）。文案明确状态是 Pi 最近发来的文本，不是实时查询。

## 2026-09-27 OpenCode 2 compatibility

English and Chinese strings distinguish OpenCode 1 and 2 and label the OpenCode 2 connection controls.

2026-10-02：共享中英文目录新增 Codex 本地遗忘/分页状态、Pi 动态思考与原生节点降级、Claude 会话控制以及 ZCode 管理结果三轴文案；已知 native token 只在显示层翻译。
2026-10-05：新增 Pi composer 继承、下一次发送/native 状态边界和会话选择保存失败的中英文本；不把 requested effort 描述为已确认 native effective。

## 2026-10-05 Codex 消息前分支与恢复

中英文同步显示旧 Codex 历史 native identity 无法唯一映射时的不可用状态。

## 2026-10-05 Claude CLI lifecycle

English and Chinese copy describe executable snapshot/restart boundaries and explicit restart failures without claiming runtime verification or guaranteeing query preservation after a generic close failure.

2026-10-06：ZCode 项目插件双语文案明确新会话、已加载快照和重连恢复的配置边界；保存结果区分会话应用、有效目录与尚未验证的插件执行。现有 translation keys 和参数保持不变。

## 2026-10-06 Codex catalog permission denial

中英文目录新增 Codex catalog 权限拒绝状态与固定说明，原始 errorReason 不作为翻译参数或可见文本。

2026-10-07: Shared session directory denial copy is backend-neutral in both locales.

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `shared.i18n` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 2026-10-23 DSH connection copy

中英文 locale 增加相同的 DSH 后端、路径、工作目录和连接状态键。文案描述本地 ACP 连接；状态取自 adapter，不把连接成功描述成模型账号或真实聊天验收通过。

## 目录定位（2026-10-23）

当前源码目录：`src/i18n`、`src/i18n/locales`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

2026-10-27 单轨 Composer 文案：中英文新增 `chat.composerMenu.*`（附件菜单、运行设置、真实词数/字符数），键集保持对齐；未引入 backend 能力或状态断言。

> 2026-10-27：新增 OpenCode 2/DSH 工作区、Codex/ZCode 拆分标签、Claude/Codex debug、Claude 标题/行内模型、Obsidian 工具/PDF 索引文案，并将提问文案改为后端中立；en/zh 同步。

> 2026-10-27（二次审查）：新增 DSH 模型/行内覆盖标签与说明，en/zh 同步。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `shared.i18n` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## 会话标签机制核对（2026-10-30）

会话标签的 closeHint 同步英中语言，说明右键、中键和 Delete 关闭；仍由既有 locale key 类型与翻译入口提供文案。 owner manifest 的职责、边界及依赖许可保持原定义。

## 2026-10-30 会话标题

六后端标题与重试说明保持双语一致，轻量选模不声称价格或原生 AI 来源。

2026-11-03：ZCode API 服务数量摘要、查看模型和带服务名的可访问标签保持双语一致；认证文案继续只对应原生支持的 required / failed / unknown。
