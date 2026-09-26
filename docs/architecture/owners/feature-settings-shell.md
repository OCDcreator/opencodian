# Owner: feature.settings-shell
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
