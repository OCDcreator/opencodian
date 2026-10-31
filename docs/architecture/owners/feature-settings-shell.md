# Owner: feature.settings-shell
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
