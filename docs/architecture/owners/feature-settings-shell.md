# Owner: feature.settings-shell

2026-11-13：Claude 权限设置公开原生 dontAsk／auto，ZCode 权限页公开 guarded；复用现有任务表单、保存／回滚和生效边界，双语说明分别表达“未预批准则拒绝”“原生分类器”和“识别危险 shell 后暂停”，不混同 bypass、普通确认或操作系统沙箱。设置层只保存选择，不复制原生运行时权限状态；新模式能否实际生效仍由 backend/readback 路径证明。

## 2026-11-12 Four-backend settings refactor

Claude Code, Codex, Pi and ZCode now share the DSH A task-form anatomy through the opt-in `opencodian-backend-task-workspace` marker. `SettingsTabbedRenderer` resolves and forwards the localized task label; `BackendSettingsWorkspace` owns only the marker, heading and existing recovery behavior. After owner content mounts, finalization places the existing scope/recovery bar below Connection/Installation only and removes exact duplicate section task headings without deleting distinct groups or classic/direct-entry titles. The marker remains on tasks without recovery. The companion task-field selector compounds the workspace and task markers on the same element, so its four-class specificity plus the later workspace import preserves 15px/600 names against the shared 13px/700 content-shell rule without `!important` or changes to unmarked backends. The task-only direct enhanced-dropdown rule likewise uses `flex: none` to keep its intrinsic block size in the column control track instead of inheriting the shared horizontal 240px basis; textareas/raw editors and unmarked backends are not selected. Four-backend segmented choices wrap by readable content width rather than equal zero-basis columns; short labels stay intact while long descriptions keep their existing wrapping and native radio/recommendation anatomy. Task tabs retain their separate horizontal-scroll behavior. Four-backend scope/effect/risk/default/source metadata now uses the existing axis/value DOM as compact host-themed badges, with a quieter axis and stronger value; long values may wrap without changing field ownership. Claude model proof chips use a task-only horizontal control row so the existing indicator leads the dropdown without reviving its former vertical 240px basis. Other task controls and content-sized actions share inline-end alignment within the right column; full-width editors and choice groups keep their established sizing, and unmarked backends do not change alignment. The shared narrow-pane selectors explicitly exclude four-backend task rows without changing other backends, while the task-owned 600px rule owns their stacked state. At the existing 720px header breakpoint, the OpenCodian wordmark is visually hidden before controls wrap: the fixed brand mark and wordmark alt remain, while the backend icon rail stays on one line and can scroll horizontally in extremely narrow panes. The registry orders the actual eight/seven/six-task surfaces without changing OpenCode 2 or DSH. Pi resources use raw native settings only, and ZCode resources/diagnostics remain read-only views over existing adapter contracts. No runtime ownership moves into the shell or chat view.

2026-11-11 OpenCode 2 polish: the existing recovery renderer adds a scoped connection/default-permission backup variant with exact three-field scope, empty/saved timestamp and shared rollback/pending behavior. OpenCode 2's section moves that DOM after Connection and omits it from other pages; the shared top source/application strip remains only for the four unchanged backend variants. No allowlist, persisted schema, snapshot store or missing-installation behavior changes.

## 2026-11-11 OpenCode 2 nine-task registry

`settingsLayoutRegistry` expands the OpenCode 2 workspace from six to nine task pages — `connection`, `model`, `agents`, `permissions`, `context`, `tools`, `mcp`, `configuration`, `advanced` — following the approved revision-2 prototype. `context` becomes a real page (its old alias override is removed). Legacy stored-id migrations: `resources` and `extensions` resolve to `configuration`, `catalog` stays `advanced`, and `auth`/`integrations`/`models` stay `model`; `resolveSecondaryTabId` still normalizes unknown ids to the default secondary tab. The registry keeps owning layout orchestration only — no save logic, no new canonical state; default secondary tab, `backendRequired`, the other backends, and the classic/tabbed shared mount seam are unchanged. Page content is owned by `feature.settings-opencode` (`SettingsOpenCode2Section.attachTabbed` mirrors the same merged-page destinations).

## 2026-11-09 DSH configuration & extensions placement, navigation seam and honest native evidence

Extension management now mounts on the approved "Configuration & extensions" task (`SettingsDshNativeWorkspace` renders readback, session defaults and the extensions workspace there); `advanced` keeps only the audited no-public-field policy groups plus content-sized cross-task links rendered solely when the tabbed host wired `navigateTask` — they target the single provider editor (request reliability/streaming timeouts/per-provider image budgets) and the configuration task's optional official terminal bundles. `SettingsDshSection.attachTabbed` carries the optional navigate callback into a mutable `nativeHost.navigateTask`, `attach()` clears it (no dead links on the stacked surface), and `SettingsTabbedRenderer` supplies `(task) => switchToPrimaryTab('dsh', task)`, so navigation stays inside the existing tab shell while the stable draft owner preserves unsaved edits. The registry's legacy `dsh.extensions` alias resolves to `configuration`; `dsh.terminal` stays `advanced`; the eight horizontal tabs and the accepted bounded 1030 themed layout are untouched.

Native evidence actions are native-only: refresh and reconnect render disabled under ACP with honest copy (startup application boundary, effective-value/status/quiescence RPCs unavailable on this ACP version) and next-step guidance (finish conversations/background tasks, then reload through the standard host controls). Both callbacks re-check live transport and render generation before any RPC, so transport switches and disposed pages cannot produce stale RPCs or false failure reports; buttons re-enable only while their render is still mounted and native, and a native reconnect still performs the actual refresh. The credential row moved as a substantive owner into `SettingsDshNativeFields.renderDshNativeCredentialRow` (core-free structural port types): metadata-only readback (configured/missing, source or unknown, writable/read-only), machine-wide shared-store scope copy, password and write actions disabled until the service proves writability, stale/availability guards on every callback, values cleared on submit, and no secret values or raw errors in feedback.

## 2026-11-09 DSH complete configuration

DSH adds task-based permission/context/tool/advanced tabs while preserving original connection/model/MCP/configuration IDs. `SettingsDshNativeWorkspace` owns sparse vault-default drafts, revision-checked group saves and non-secret recovery; metadata-driven `SettingsDshNativeFields` owns inherited/override/structured entry controls. Runtime evidence is read from the adapter and kept separate from the saved revision. `SettingsDshExtensionsWorkspace` owns user-triggered package operations on the proven managed profile and renders catalog rows with profile selection kept separate from the runtime's public plugin fiber phase and bundle availability (absent fields display explicit unknown states; fixed localized copy only, never raw diagnostics); `SettingsDshExtensionSettings` renders editable public loaded-extension form paths with native CAS. No settings surface writes a user SDK profile or claims request echoes as runtime proof. MCP's existing persistence remains in its workspace, with reused server controls for masked env/headers, advanced declaration fields and honest mounted/unknown connection status. Renderer and both hosts dispose DSH subscriptions on replacement and close. The current visual contract, native custom dropdown enhancement and connection-only four-field backup remain.

`SettingsDshNativeHistory` owns validated non-secret recovery previews and explicit apply/cancel, reusing the existing private recovery store. The workspace retains actual queued writes and rollback, with final snapshot/config/draft/generation guards; raw JSON locks cover the recovery surface. The permissions task also saves the plugin-owned `defaultPlanMode` for future fresh native sessions only, separate from nativeConfig and current permission/Plan controls; ACP keeps the saved value but disables editing.

## 2026-11-09 DSH A layout and existing dropdown ownership

The DSH backup component is now a connection-only task. `BackendSettingsWorkspace` renders a DSH-specific disclosure with explicit purpose, empty/saved timestamp, exact four-field scope, exclusions and one-backup replacement semantics. `SettingsDshSection.renderTab` keeps/moves it only on Connection and removes the bar on the other three pages; the workspace markers and separate missing-executable alert remain. The existing allowlist, record schema, store, in-place restore and rollback owners are unchanged. State text updates after saving without a redraw; pending buttons disable together and local error text contains no raw persistence details. Other backend variants retain their shared wording and behavior.

A subsequent navigation-spacing correction excludes DSH from the backend-only 42px padded rail selector. Its two navigation levels use the same unpadded, wrapping category layout and 12px rail separation as General/Conversation. This is a CSS selector change only: settings routing, form layout, automatic persistence and runtime ownership are unchanged.

The user's right-column alignment refinement centers the existing DSH control grid item against its title/description block and removes the old5px information-block top offset. Grid rows stay top-aligned for tall editors; narrow controls remain below their labels. This changes two CSS declarations without new runtime ownership.

A further DSH title refinement follows the user's request and local `my-skills` Claude references. The existing DSH CSS gives field names15px/600 with6px separation from12px explanations; disclosure headers14px and child names13px preserve hierarchy. Selected MCP servers use16px. This changes typography only, with no new UI/state owner, navigation, width or persistence path.

The user's next request applies to the whole Settings content width. The shared layout contract scopes native host sizing to panes containing `.opencodian-settings`: a1160px group cap gives ordinary content about1120px while smaller windows remain fluid. The inherited700px centering offset is recomputed locally, so wider panes stay centered. DSH's1030px form maximum and the navigation correction remain in their existing stylesheet. No new resize observer, runtime state or persistence owner is introduced; unrelated host pages retain native sizing.

The user-selected DSH treatment preserves horizontal backend subtabs. Connection rendering owns a compact radio segment and two path selectors, while the settings host still owns `SettingsDropdownControl` enhancement, keyboard scope, portal window and cleanup. Path-mode selection only reveals an input; nonempty change events persist through the existing host. Failed saves restore the field, visible mode and input; selecting the default explicitly clears the override. No new backend runtime owner or configuration store is introduced. The DSH CSS guard keeps the other backend workspaces unchanged. DSH `renderTab` moves the already-created shared recovery bar after its section, preserving the original control handlers and DOM/keyboard order; the secondary recovery flow never precedes the main heading. DSH advanced launch fields remain inside an explicit disclosure body with subordinate styling; the environment field owns its row editor and add action in the same Setting control. These are DOM hierarchy changes within the settings owner, not new persistence or runtime state. The MCP raw JSON disclosure uses that same body anatomy and an editor-specific one-column Setting; its draft and save/apply ownership remain entirely in `SettingsDshMcpWorkspace`. All four DSH disclosure kinds share the same scoped frame/summary styling.

## 2026-11-07 Task-based backend configuration

The six backend workspaces share native DOM choice controls and an explicit vault-default recovery strip. `BackendSettingsControls` owns accessible radio/slider behavior and scope/application metadata; `BackendSettingsWorkspace` owns only allowlisted non-secret snapshots and UI persistence, not runtime truth. `SettingsTabbedRenderer` uses the same backend mount for classic, tabbed and editor-area hosts. Backend-specific process, permission and native-file operations remain in their existing owners. The task registry preserves old navigation ids and physically separates permission/sandbox choices from normal model defaults.

Working configuration is user-marked after a usable setup; saving a snapshot is not backend verification. Restore preserves the selected backend settings object's identity, keeps all other backend references intact, and uses the existing Codex mutation seam before redraw. Keys, environment values and native source files retain their original stores/history. Failed persistence restores the prior in-memory values; real persisted reload and backend readback remain separate acceptance evidence.

2026-11-02：远程控制确认与令牌展示 modal 在既有 owner 内补齐插件根标记，使共享界面排版能正确限定作用域。未新增状态、依赖或令牌操作路径。

> 2026-10-26（DSH UI 修复）：DSH 设置字段与 MCP 声明编辑器使用与可见名称一致的 accessible name，连接状态使用独立 live region；配置回读本地化模型/推理名称。MCP 编辑器按规范化声明区分未保存草稿、已保存声明和空闲会话应用反馈，不以 JSON 排版或显式 stdio 类型误判差异。设置页继续调用既有保存/回读/apply host，应用计数不表示服务器在线状态。
> 2026-10-02（T03）：ZCode 四字段控件 callback 合并当时最新的规范化 host state，并在 await save 前写回，避免 render snapshot 恢复其他字段旧值；classic/tabbed、快速输入与异步 save 完成顺序纳入组件回归。设置 shell 不增加后端 runtime 所有权；真实磁盘 persistence、native application/readback 和 host UI 证据仍独立。
> 2026-09-30 (Codex 0.159 integration)：settingsLayoutRegistry 为 codex 注册新二级 tab `plugins`（排在 `resources` 之后）。
> 2026-09-28：OpenCode 2 出现在已启用后端的行内编辑和补全模型覆盖列表中，示例使用 `provider/model`，与实际解析格式一致。
> 2026-09-22 (ZCode 票 01)：SettingsTabbedRenderer 新增 zcode 主页签路由（SettingsZCodeSection.attachTabbed，与 pi 同模式）；settingsLayoutRegistry 注册 `zcode` 主页签（connection 二级 tab，backendRequired: zcode）；AgentSwitcherFloatingIcons 注册 opencodian-zcode 官方图标并补齐穷举映射 zcode 条目。
> 2026-09-21 (advantage-parity R-F4)：SettingsTabbedRenderer 的 agent switcher 更新 active backend 后通知组合根刷新 R-F4 单池预热；不在设置 shell 构造会话或提交模型轮次。
> 2026-09-21 (advantage-parity R-F7)：新增 EnvironmentVariablesModal（结构化 host）+ SettingsPanelChrome 共享行；三个设置面（tabbed/经典/编辑器区）General 合并块接入。
> 2026-09-21 (advantage-parity R-F8)：SettingsModelSection 通用 tab 新增上下文窗口声明入口（feature-settings-plugin 的 modal 经窄 port 复用）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-20 (advantage-parity R-D1)：conversation 主 tab 二级 tabs 新增 export（backend 无关）。

Update progress (2026-09-10): both settings hosts retain and dispose the update section on replacement or close/hide; async completion may not resurrect a disposed surface. The expanded state survives install-driven refreshes.

Pricing readiness (2026-09-10): the settings shell binds catalog notifications to the active display container and disposes the prior binding on render/hide. Notification handlers update only existing pricing descriptions.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): settingsLayoutRegistry gained the backend-agnostic conversation/memory secondary tab.
- 2026-09-18 (FlowText parity R-A1/R-A2): `SettingsInlineEditSection` gained the `inlineEditTriggerAt` toggle, the unbound-hotkey discoverability row (optional `openHotkeySettings` callback, deep-links into Obsidian's own hotkeys tab via `app.setting.open()` + `openTabById('hotkeys')`), and the `#` preset prompt CRUD rows (add/remove/edit label + body, persisted raw; load normalization prunes half-edited entries on next start). `OpenCodianSettings` supplies the callback through `openObsidianHotkeySettings()`.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/settings/**`

## Responsibilities
- settings tab shell, router, coordinator and shared controls
- settings normalization and view registration

## Canonical state (truth home)
- OpenCodianSettings normalized state
- settings section coordinator state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/OpenCodianSettingsView.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`, `core.config`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.settings-debug`, `feature.settings-model-catalog`
- **Delegates to:** `feature.settings-debug`, `feature.settings-model-catalog`, `feature.settings-claude`, `feature.settings-codex`, `feature.settings-opencode`, `feature.settings-style`, `feature.settings-mcp`, `feature.settings-agents`, `feature.settings-plugin`

## Focused tests
- `tests/unit/features/settings/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Recent change notes

- **Direct Settings entry (2026-09-09):** Obsidian 1.13+ uses a searchable render definition to mount the complete settings surface immediately. Do not wrap the whole UI in a navigable page definition: that adds an unwanted landing card. Render cleanup delegates to hide and clears only the matching active container; pre-1.13 hosts keep the imperative fallback.

- **Obsidian 1.13.4 compatibility (Phase A):** `SettingsDropdownControl.enhanceSettingsDropdowns` now filters Obsidian 1.13's transient `select.dropdown.is-measuring` width probes (one per `DropdownComponent`) via the exported `isEnhanceableRealSelect()` predicate, applied to both the initial container scan and the MutationObserver increment. Without this, every settings row rendered two visible dropdowns. The filter is explicit and timing-independent, and must not be replaced by blanket `aria-hidden` hiding of real selects. Regression coverage lives in `tests/unit/features/settings/SettingsDropdownControl.test.ts` (`host measuring-probe regression`). Full host-coupling audit: `docs/status/obsidian-1.13-host-coupling-inventory.md`.
- **Obsidian 1.13.4 detached Settings window:** every `SettingsDropdownControl` instance is scoped to its backing select's `ownerDocument` and `defaultView`. Its custom root/menu nodes, portal destination, viewport positioning, RAF, `MutationObserver`, change event, and pointer/scroll/resize cleanup must stay in that same renderer window. Do not use lexical global `document` / `window`: doing so portals an open Settings dropdown into the main vault window, leaving only its trigger chevron visible in the detached Settings window. Conversely, do not require the select to be an instance of only the owner-window constructor: Obsidian's detached document retains main-renderer select prototypes, and rejecting them exposes the host-native dropdown. The foreign-document and split-realm regression cases live beside the measuring-probe coverage in `tests/unit/features/settings/SettingsDropdownControl.test.ts`; runtime evidence is recorded in `docs/status/obsidian-1.13-host-coupling-inventory.md` item 1.1.

## Pi owner boundary review (2026-09-08)

SettingsPiSection owns the Pi settings surface through a narrow host. Credential/provider configuration remains in the external Pi installation.

2026-09-09：Pi独立主标签与八个二级页沿用后端导航契约；两项Pi配置子模块分别管理原生设置和provider/model表单。

2026-09-09：设置表单间距由共享opencodian-settings-form-stack容器控制，跨wrapper与空状态区域仍保持12px；Pi配置渲染只挂布局类，不改变配置读写。验收需测量可见卡片几何边界，不能只检查相邻DOM兄弟。

- 2026-09-15: 新增 `SettingsInlineEditSection`（`inlineEditEnabled` 总开关 + 按 backend 键控的模型覆盖，输入即校验）并挂到设置页。该分节按结构类型接收插件（settings + saveSettings），以避免 feature → app 依赖边。

- 2026-09-17: `SettingsPiSection` 新增只读 `mcp` 二级标签（排在 execution 与 resources 之间）：声明清单来自 `core.backend-pi` 的 `PiMcpConfigService`（读 Pi 的配置文件），运行时状态来自 `PiAdapter.getExtensionStatus()`（扩展上报文本）。该页无任何写操作、也不解析上报文本；没有适配器实例时清单仍能渲染，所以 `attachTabbed` 的 mcp 分支排在 `if (!adapter)` 之前。构造器第二参数可注入配置读取器供测试。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.settings-shell` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 2026-10-13 Pi 状态显示输出边界

`SettingsPiSection.mcpStatus` 在 statuses/message 的 DOM 文本输出点选择共享 sanitizer 的严格 URL 策略。此 owner 仅控制显示：PiAdapter 缓存/RPC 对象保持，不解析连接状态，不新增 Copy UI，不接管 Pi 运行时；safe 文本、时间、role 与布局保持。typed mock → JSDOM 回归不能替代 Pi native/UI/profile 验收。

## 目录定位（2026-10-23）

当前源码目录：`src/features/settings`、`src/features/settings/backends/codex`、`src/features/settings/backends/pi`、`src/features/settings/backends/zcode`、`src/features/settings/controls`、`src/features/settings/general`、`src/features/settings/models`、`src/features/settings/resources`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

## 2026-10-24 DSH 设置子区

`backends/dsh/SettingsDshSection.ts` 是无运行时状态所有权的设置子区，通过窄 host 使用既有后端组合层传入的操作，保持此 owner 不直接依赖 core.backend 或 main.ts。原生会话、配置回读和 MCP 准入状态仍归后端 owner。

> 2026-10-27：两个设置宿主共用 `getBackendWorkspaceTab` / `getVisibleBackendWorkspaces` 与 SettingsTabbedRenderer 的后端管理/工作区挂载；经典布局使用本地二级导航逐页挂载，切换子页时清空旧 title refresh callback 并 dispose 旧 Codex section。

> 2026-10-27（二次审查）：Codex section 在任意经典后端子页切换前统一 dispose 并清空引用（含 account→debug）；DSH 工作区新增 model 子页，复用共享行内覆盖组件。

> 2026-10-27（UI 验收修复）：DSH renderTab 增加标准 section-body wrapper；标题备份模型按钮在创建时有可读初始标签。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `feature.settings-shell` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## Goal 与会话工作台（2026-10-30）

Pi 工作台列出具名目标读取/控制命令；会话设置中的 Codex Goal 与聊天工作台消费同一 adapter 状态。设置 UI 对失败保留卡片和输入，不以操作 ACK 当作目标清除成功。

## 2026-11-02 ZCode task settings

ZCode 采用三任务页；SettingsZCodeModelControls 展示原生模型与默认字段，SettingsZCodeAccounts 展示登录和 API 表单。窄后端接口保留 credentials/config 写入的 core.backend 所有权，组件不成为第二个运行时 truth store。

API 服务行只摘要地址与模型数量，完整 ID 通过默认收起的原生展开区和共享有界 ScrollArea 查看；该展示调整不改变编辑数据或后端契约。
- 2026-11-12 (claude-provider-clarity) owner manifest 核对：与基线 1d3fa289 对 architecture-owners.config.json 做程序化逐 owner deep-equal 对比，全仓仅 feature.settings-claude 的 include 纯插入新增 `src/features/settings/backends/claude/SettingsClaudeProviderModals.ts`（无删除、无其他字段变化）；本 owner（feature.settings-shell）的 include、responsibilities、canonical state 与依赖约束逐项对比未变。此为 manifest-diff 核对记录，不构成全量架构评审。
