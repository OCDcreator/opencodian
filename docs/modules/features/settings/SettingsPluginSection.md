# SettingsPluginSection

> **源码**: `src/features/settings/SettingsPluginSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsPluginSection` 是 settings/plugins 分区的厚 owner。它从 `OpenCodianSettings.ts` 接管插件管理 section 的完整 lifecycle：插件环境快照刷新、project config plugin 编辑器、项目插件安装区、per-entry 启用/禁用与删除控制、isolation mode 写回、项目插件目录创建、项目级 OMO 配置创建/打开，以及 SDK 1.18.3 plugin evidence（effective config + `plugin.added` runtime evidence）的分层展示。

这个 owner 的职责边界刻意保持在“**plugin management section 装配 + snapshot refresh orchestration**”：

- 持有 plugin section 级别的 DOM 组装、快照渲染与 action wiring
- 使用 `PluginManagementService` 读取 global/project config 与插件目录快照
- 保存 project config 中的 `plugin` 列表，并保留 local/remote restart notice 语义
- 渲染项目插件 install section，并通过 service action 管理项目 config / directory 插件的 enable、disable、uninstall、delete 流程
- 管理 OMO 配置文件的创建、写入 vault adapter 与 Obsidian tab 打开流程
- 拥有 SDK evidence 订阅/刷新生命周期，但把 evidence DOM 渲染委托给 `SettingsPluginEvidencePresenter`

## 核心逻辑

### section lifecycle 收束

`attach()` 会在一个 owner 内完成 plugins section 的主要阶段：

- 创建 section heading 与 overview/config-sources/project-plugins/OMO 四个 subsection，其中 project directory 区包含项目插件 install section 与 managed entries
- 首次刷新 `PluginEnvironmentSnapshot` 并回填 project config textarea
- 装配 refresh/open raw config action
- 装配 project config plugin 保存按钮
- 装配项目 config plugin 安装输入，以及每个项目插件条目的 toggle / uninstall / delete action
- 装配 isolation mode dropdown、project plugin directory create action 与 OMO open action

这样 `OpenCodianSettings` 不再直接持有 plugin snapshot、editor、directory 或 OMO lifecycle 细节，只保留 owner 创建与 formatting bridge。

### snapshot refresh orchestration

owner 内部把快照刷新链路集中起来：

- 用当前 `server.mode` 与 `pluginIsolationMode` 调用 `PluginManagementService.inspect()`
- 将 `projectConfigSpecs` 格式化回 textarea，保持 project config editor 与快照同步
- 渲染 service/isolation/global influence、global/project plugin 来源、project directory 与 OMO 状态
- 插件来源分组会把路径状态和已检测插件数分开渲染：目录路径逐行显示 `available/missing`，插件条目只代表实际检测结果，避免“路径不存在但下方还有插件”的误读
- 项目级已管理条目由 `renderManagedEntryGroup()` / `renderManagedEntryRow()` 统一渲染，config plugin 与 directory plugin 共用禁用状态展示、行内 toggle，以及卸载/删除按钮语义
- 在手动 refresh 时显示成功/失败 notice

`dispose()` 会递增 refresh run id，并取消 plugin evidence listener 订阅、清空最近 evidence 快照，避免 settings tab 关闭或重建后的旧异步刷新继续更新旧 DOM。

### plugin evidence 分层展示（SDK 1.18.3）

`attach()` 与 `attachTabbed('overview')` 都会通过 `SettingsPluginEvidenceCoordinator` 订阅 plugin evidence，并在初始加载与用户手动刷新时同时调用：

1. `PluginManagementService.inspect()` —— 本地声明快照
2. `SettingsPluginEvidenceCoordinator.refresh()` —— SDK effective config evidence

`tabbed` 的 `config-sources` / `project-plugins` / `omo` 子页只 inspect 本地声明，不订阅也不刷新 SDK evidence。

Overview 四层 evidence DOM 由 `SettingsPluginEvidencePresenter` 渲染，使用 `data-evidence-kind` 标记：

- `local-summary` —— service/isolation/vault/global influence/project counts 等本地声明汇总
- `effective-config` —— `sdk.config.get()` 返回的 effective plugin specs；包含当前 effective、stale effective、fetch status/error、connection generation
- `runtime` —— 从 `plugin.added` 事件观察到的 **未归因 runtime plugin IDs**；明确标注为 unattributed，不与任何声明自动匹配
- `transport` —— event capture 是否 wanted、active sources、capture generation/startedAt，并说明 `plugin.added` 无 replay

所有 SDK evidence 文案避免把 `ready` 译成“已加载”，不把空 runtime 列表解释为“没有插件加载”，也不在远程模式下暗示本地文件修改会同步到远端后端。

fetch status 诚实区分：
- `idle` + `attemptedAt === null` → 空闲/未请求
- `idle` + `attemptedAt` 有值 → 刷新中（refreshing）
- `ready`
- `error`

### 远程模式诚实性

当 `server.mode === 'remote'` 时：

- overview 顶部显示 `[data-remote-honesty="true"]` 提示，说明当前 controls 只修改本机 vault 文件，不修改远端 OpenCode 配置
- install、project config editor、project plugin directory create/delete 等本地文件操作旁边附加 `[data-local-only="true"]` 标签
- managed config 与 managed directory 的每个 group 和 row 也附加 `[data-local-only="true"]` 标签
- 不提供 `config.update()` 写入路径，也不声称本地保存会更新远端后端
- runtime effective truth 仍以 SDK `config.get()` evidence 为准

### 配置来源 provenance 渲染

`renderPluginSources()` 优先使用 `snapshot.configSources` 渲染 7 个已知配置来源：

- global: `config.json`、`opencode.json`、`opencode.jsonc`
- project root: `opencode.json`、`opencode.jsonc`
- project `.opencode/`: `opencode.json`、`opencode.jsonc`

每个来源展示 scope、path、exists/missing、editable/read-only、parse error、entries。只有 `<vault>/.opencode/opencode.json` 是 canonical 可编辑来源，保留 managed controls；其他 JSON/JSONC 来源只读展示，不会被合并或写回。

#### 单源面板结构（无嵌套卡片）

`renderConfigSourceGroup()` 把每个来源渲染为一个扁平的 source-level 面板，避免重复路径与嵌套卡片噪音：

- header：filename basename 作为简洁身份、count badge、scope/access 低色度小徽章
- 完整路径只出现一次：muted mono path line（`.opencodian-plugin-source-path`），不再用边框/背景做成 inline 卡片
- metadata：紧凑 `<dl>` 行（`.opencodian-plugin-source-meta-row`），每行 `dt` 标签 + `dd` 值，**不是每个字段单独一张全宽卡**
- entries：扁平 `.opencodian-plugin-source-list` 行 + 分隔线，而非每个 entry 都嵌套一张 object card
- empty：subdued inline `.opencodian-plugin-source-empty`（不是 alert 卡片）
- missing（候选路径不存在）：中性 muted 状态 + `data-note-kind="missing"` 安抚说明，不当作错误
- parse error：`data-path-status="error"` + `.is-error` metadata row，使用 `--text-error` 语义

#### 配置来源筛选（segmented filter）

`attachTabbed('config-sources')` 在面板顶部渲染一个 accessible segmented filter：

- `role="group"` 容器 + 三个 `type="button"` 按钮（All / Global / Project）
- 选中按钮 `aria-pressed="true"` + `.is-active` 类；未选中 `aria-pressed="false"`
- 点击更新 `this.configSourceFilter` 与 `.opencodian-plugin-source-filter-host` 的 `data-source-filter` 属性
- **不变量**：`renderPluginSources()` 始终把 `configSources` 中的全部来源渲染到 filter host，从不按 filter 裁剪 DOM。筛选只由 host 的 `data-source-filter` + CSS 规则控制。这保证 managed action 触发 refresh 重建 DOM 后，切换到 All 仍能看到全部来源
- 某 scope 没有来源时渲染 `data-empty-scope` placeholder（不携带 `data-source-scope`），CSS 通过 `:has([data-source-scope="X"])` 检测真实来源是否存在来决定是否显示 placeholder
- 窄宽度（≤480px）时 filter 改为全宽均分，metadata 行降到单列，header 改为垂直排列
- filter 状态是 section 实例字段，不是 persisted setting；切到其他 tab 再回到 config-sources 时回到默认 `'all'`

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 构建并挂载 plugins section，启动首次快照刷新，并注册所有 plugin management actions |
| `attachTabbed()` | tabbed settings layout 入口，按 secondary tab 路由 overview/config-sources/project-plugins/omo |
| `dispose()` | 使当前异步快照刷新失效，取消 plugin evidence 订阅，供 settings tab 重建或关闭时调用 |
| `subscribeToPluginEvidence()` | 在 overview 挂载时委托 `SettingsPluginEvidenceCoordinator.subscribe()` 注册证据回调，按 run id 过滤 |
| `refreshPluginEvidence()` | 触发 `SettingsPluginEvidenceCoordinator.refresh()` 并缓存快照 |
| `renderPluginOverview()` | 委托 `SettingsPluginEvidencePresenter` 渲染 overview |
| `renderPluginSources()` | 渲染 7 个配置来源 provenance，应用 `configSourceFilter`；仅 canonical project JSON 提供 managed controls |
| `renderConfigSourceFilter()` | 在 config-sources tab 渲染 accessible segmented filter（All / Global / Project） |
| `renderConfigSourceGroup()` | 渲染单个配置来源的扁平 source-level 面板：header identity + badges + 单路径 + dl metadata + flat entries |
| `renderManagedEntryGroup()` | 渲染项目级 directory 插件的托管条目分组（legacy fallback 路径） |
| `renderManagedEntryRow()` | 渲染单个项目插件条目，并连接 enable/disable、uninstall 或 delete 控制 |
| `renderLocalOnlyLabel()` | 在远程模式下为本地文件操作/托管条目附加 local-only 标签 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用 owner，向其提供 section heading、inline-code formatting 与 setting name/desc formatting seams
- `PluginManagementService.ts`: 提供本地 plugin 声明快照、project plugin config 写回、project plugin install/uninstall/toggle/delete、project plugin directory 创建与 OMO config 创建
- `OpenCodeService.ts` / `OpenCodeEventSubscriptionCoordinator.ts`: 提供 SDK 1.18.3 effective config 与 `plugin.added` runtime evidence 的底层捕获；`SettingsPluginSection` 不直接调用 Service 的 plugin evidence 方法，也不拥有 evidence state
- `SettingsPluginEvidenceCoordinator.ts`: Settings 侧稳定的非 DOM lifecycle/transport owner，复用 `getServerBaseUrl`、vault path normalize 与 `OpenCodeSdkFacade` 构建 directory-scoped `config.get()` 与 connection signature，并通过 `OpenCodeService.subscribeToOpenCodeEvents()` 传入 observer 对象接入 evidence 流
- `SettingsPluginEvidencePresenter.ts`: 负责 overview 中 local summary + SDK evidence 的只读 DOM 渲染与增量更新
- `OpencodeConfigManager.ts`: 用于 raw `.opencode/opencode.json` modal 与 project plugin config 写回
- `OpencodeConfigModal.ts`: 提供 raw OpenCode config 编辑入口
- `shared/vault.ts`: 通过 `getVaultBasePath()` 获取 vault base path，用于 project scope 与 OMO 文件相对路径

## 关键 DOM / data 属性

| 属性 | 说明 |
|------|------|
| `data-section-block="overview"` / `"config-sources"` / `"project-plugins"` / `"omo"` | tabbed 子页根节点 |
| `data-remote-honesty="true"` | 远程模式本地-only 提示 |
| `data-local-only="true"` | 本地文件操作 / 托管条目标签 |
| `data-source-scope="global"` / `"project"` | 配置来源作用域 |
| `data-source-access="editable"` / `"read-only"` | 配置来源可编辑性 |
| `data-source-path="..."` | 配置来源绝对路径 |
| `data-path-status="available"` / `"missing"` / `"error"` | 配置来源解析状态（missing 是中性状态，error 才是错误语义） |
| `data-source-filter="all"` / `"global"` / `"project"` | config-sources tab 的 segmented filter 当前选择；同时存在于 filter button 的 `data-source-filter` 与 filter host 容器上 |
| `data-empty-kind="no-entries"` | source 面板的 subdued empty 状态 |
| `data-empty-scope="all"` / `"global"` / `"project"` | filtered empty 状态（某 scope 下没有 source） |
| `data-note-kind="missing"` | 候选路径不存在的安抚说明（中性，不是错误） |
| `data-source-identity="<basename>"` | source header 上的 filename basename 身份标识 |

SDK evidence 区专属 `data-evidence-kind` / `data-effective-state` / `data-runtime-state` / `data-runtime-current` 属性由 `SettingsPluginEvidencePresenter` 文档维护。

## 注意事项

- 不要改变 plugin snapshot 来源、project/global 解析顺序、restart notice 语义或 OMO 配置创建规则。
- `pluginIsolationMode` 写回后必须保存设置并刷新 snapshot；OpenCode 服务是否需要重启仍通过既有 notice 告知。
- OMO action 需要先确保 project OMO config 存在，再把文件镜像进 vault adapter 并用 `workspace.openLinkText()` 打开。
- 项目插件行的启用/禁用状态来自 `PluginEntry.disabled` 与 service 层的 `disabledPluginSpecs` 合并结果，UI 不应维护第二套禁用真相。
- Directory plugin 的 delete action 会删除 `.opencode/plugins` 下的文件；config plugin 的 uninstall action 只更新项目 `plugin` 数组。
- 如果后续继续推进 plugins lane，优先在这个 owner 内扩展完整 section lifecycle，而不是回到 `OpenCodianSettings` 主类里追加闭包。

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `overview` — renders environment snapshot overview
- `config-sources` — renders all config sources with an accessible segmented filter (All / Global / Project)
- `project-plugins` — renders project plugin directory management
- `omo` — renders OMO config management

The classic `attach()` method remains unchanged.

Project plugin config textareas use `TextareaSizeMemory` with stable keys so manual resize height survives settings reloads; `dispose()` cleans the attached observers.

## 2026-07-21 Plugin page IA + source panel refactor

- Secondary tab IDs renamed: `global` → `config-sources`, `project-directory` → `project-plugins`. Legacy persisted values are normalized via `LEGACY_SECONDARY_TAB_ID_MAP.plugins` in `settingsLayoutRegistry.ts`, so users with the old tabs saved will land on the new ones instead of falling back to default.
- Information architecture fix: previously the "global" tab actually rendered both global and project config sources, contradicting its label. The new `config-sources` tab is honest about what it shows, and the segmented filter lets users narrow by scope.
- Source panel is no longer nested-card-based:
  - Full path appears exactly once per source (muted mono code line), the header title shows only the basename.
  - Scope and access are low-chroma badge chips in the header, not full metadata cards.
  - Metadata uses semantic `<dl>` rows (`.opencodian-plugin-source-meta-row`), not a stack of full-width cards.
  - Entries are flat rows separated by a single border-top + per-row border-bottom, not a stack of object-bg cards.
  - Empty entries render as subdued inline italic text, not as Alert cards.
  - Missing candidate paths render with neutral muted styling + a reassuring note; only parse errors use `--text-error` semantics.
- Segmented filter:
  - `role="group"` container, three `type="button"` toggles with `aria-pressed`.
  - Click updates `data-source-filter` on the host; CSS rules hide non-matching scopes without re-rendering.
  - At ≤480px the filter goes full-width and the buttons split evenly.
- Classic `attach()` benefits from the same panel refactor (single render path), but does not get the segmented filter (it shows all sources in one column as before).
- `configSourceFilter` is a private section-instance field, not persisted: switching tabs resets to `'all'`.
