# SettingsBackendSection

本模块承载两个同 owner（`feature.settings-opencode`）的设置面，避免新增 settings SCC 成员：

- `SettingsBackendSection`：`General > 智能体管理` 后端管理面（默认后端、启用开关、聊天预热策略），并组装 DSH 设置区（`createSettingsDshSection`）。
- `SettingsOpenCode2Section`：OpenCode 2 原生配置工作区，按九个功能页组织：`connection`、`model`、`agents`、`permissions`、`context`、`tools`、`mcp`、`configuration`、`advanced`。官方 OpenCode v2 SVG 本地注册为 `opencodian-opencode2`；宿主主题下的样式限定在 `.opencodian-opencode2-settings`（视觉契约见 `docs/modules/style/components/settings-opencode2.md`）。

> **源码**: `src/features/settings/backends/opencode/SettingsBackendSection.ts`
> **状态**: [REVIEW]

## OpenCode 2 工作区（SettingsOpenCode2Section）

### 页面与导航

- tabbed 宿主（`SettingsTabbedRenderer`）按二级 tab 调用 `attachTabbed(root, secondaryTabId)`：先匹配九个真实 tab id，再查合并页别名，未知 id 回退 `connection`；`attach()` 按序挂载全部九页（堆叠面）。合并页别名（registry `LEGACY_SECONDARY_TAB_ID_MAP` 对已存 id 保持权威，本文件只镜像合并页去向）：`resources`/`extensions` → `configuration`，`catalog` → `advanced`，`auth`/`integrations`/`models` → `model`；`context` 是真实页面，不再有别名。
- 宿主注入 `renderTitleSettings`（标题生成等真实 OpenCode 2 消费者共用的控件渲染器）与稳定 vault 绝对路径（机器本地恢复身份使用）。
- 页面头部：标题/简介、目录同步状态（`data-catalog-state` loading/failed/complete/idle，配缓存/已同步文案）、刷新按钮、范围徽章（本地/远程 + OpenCode 版本）。远程模式显示只读声明；检测到外部 `configContent` 变更显示冲突提示。

### 目录同步

- 挂载后并行读取 `readConfigurationSummary`、`readManagementCatalog`、`getModelSelectorProviders`；同一插件实例经 WeakMap 共享 30 秒缓存与并发 promise，连接参数（mode/executablePath/baseUrl/password）改变后建立独立范围，旧请求不会写回新范围。失败保留已有目录，并使用与后端管理面共享的固定脱敏分类文案（`getSettingsCatalogFailureMessage`），原始错误文本不进入设置面。

### 草稿模型（本地覆盖 overlay）

- 工作区编辑的是当前 Vault 的插件管理本地服务覆盖（`backendSettings.opencode2.configContent`，JSONC），不冒充项目文件或全局文件写入；范围徽章明示当前作用域。远程模式的定义面只读，认证与原生 MCP 连接操作仍可操作。
- `saved`（已保存基线）/ `draft`（工作草稿）/ `rawDraft`（advanced 原始 JSONC 暂存）三层。引导编辑经 `jsonc-parser` 的 `modify`/`applyEdits` 写入指定路径，保留未知字段和注释；局部无效输入按字段路径存入 buffer（带错误文案与 `aria-invalid`），跨页面保留并阻止应用，绝不写入草稿。
- 可编辑门：本地模式、非保存中、无未合并 rawDraft、草稿可解析为 JSONC 对象、无冲突。外部 `configContent` 变更（冲突）阻止旧草稿覆盖，直到 Discard 以存储值重新对齐基线。

### 集合编辑器（providers / agents / commands / mcp.servers / references）

- 条目集合 = 当前原生目录 ∪ Vault 覆盖对象键；可搜索有界列表 + 具名编辑器区域（`role="region"`）。记录状态徽章区分 inherited/custom/new/dirty/override/invalid。
- 列表摘要优先取记录 `description`，其次目录描述，再按集合回退（providers 为模型数、references 为实际路径/仓库、mcp 为传输类型或目录状态）；无 runtime 条目且无 description 的 commands 记录显示「尚未填写用途」（`collectionNoDescription`），不再落回通用运行目录文案。
- 新建校验：id 字符集 `[\w./@:-]+`、`__proto__`/`constructor`/`prototype` 原型污染守卫、重复检查；种子值 commands 为 `{template:''}`、mcp 为 `{type:'local',command:[]}`。
- 每记录操作：目录内记录提供"还原"（只删除插件覆盖，让原生定义透出，不写任何原生文件）；纯覆盖记录提供"移除"，带内联确认。commands/mcp 的目录记录标注运行时目录信息有限（`recordRuntimeOnly`），不伪造目录没有的字段。
- provider 记录内嵌套每 provider 的模型子编辑器（name、modelID，advanced 的 limit context/output、settings、variants JSON）。

### 字段系统

- 每个字段行：来源徽章（覆盖时显示"当前库覆盖"；未覆盖显示"继承"；MCP 已有记录内未声明的子字段显示 "Not set" 占位）+ 字段级错误状态。
- 字段级还原按钮默认提供（未覆盖时隐藏），两类例外不提供：MCP 必需的 `type`/`command`/`url` 字段，以及直接绑定记录根路径的字段（如 MCP 完整声明 JSON、references 记录）——整记录移除统一走条目页脚的确认流程。
- 布尔字段按键语义命名选项：`hidden` 用"隐藏/显示"，`disabled` 用"停用/启用"（否定键不复用通用"启用/关闭"），并接入各自专属说明（隐藏 ≠ 停用）。
- 继承值读回（`inheritedValue`）只使用真实运行时目录值（agent 目录条目字段（`permissions` 除外）与 provider 模型显示名）；其余字段显示"继承/未知"占位，从不伪造配置默认值。
- select 字段把未知存储值保留为显式选项；模型字段提供实时目录选择器或 `provider/model#variant` 手工引用，存储值（字符串或展开对象形态）在用户修改前原样保留。
- 数字字段整数并带下限（agent steps ≥ 1、MCP 超时 ≥ 1、模型 limit ≥ 1）；compaction buffer 按原生 Schema 值域：百分比 1 ≤ x < 100（可小数，99.5 合法，0.5/0/100 拒绝）或非负安全整数 Token。
- 字符串数组字段（instructions/skills/watcher ignore）值为纯字符串数组时按行编辑（一行一条，留空恢复继承）；存量数组含非字符串项时退化为 JSON 数组编辑。

### 各页面内容

- **connection**：连接方式选择（本地推荐/远程；vault 范围、重连生效）。本地为可执行文件自动/自定义路径，远程为 baseUrl + 密码；连接状态组（就绪/等待 + 测试连接）；配置来源组为只读说明行：原生配置来源 + 本地模式的 Vault 覆盖来源（区分已有保存内容与空覆盖，明确 saved ≠ applied）或远程模式的远程托管来源。连接设置是插件设置，不进 JSONC 草稿。
- **model**：默认聊天模型引用（`model`）；providers 集合编辑器（package、baseURL、嵌套模型子编辑器、settings JSON disclosure，含凭据提示）；辅助模型 disclosure（标题生成共用控件 + opencode2 行内编辑/补全模型覆盖）；认证 disclosure（原生 integrations 目录：API key、OAuth 发起/完成/查询/取消、env 方法名展示、form 答案 JSON；凭据 activate/remove）。认证输入的密钥只用于当次 adapter 调用，不保存到草稿。
- **agents**：`default_agent` 下拉（非 subagent 且未禁用的 agent，禁用判定含原生目录 `disabled` 与本地覆盖；无可选项退化为文本输入）；agents 集合编辑器（description、模型引用、mode primary/subagent/all（含使用场景说明）、多行 system prompt；advanced：hidden（隐藏/显示）、disabled（停用/启用，均带专属说明）、steps ≥ 1、嵌套有序权限规则）。
- **permissions**：插件 `permissionMode` 选择（inherit 推荐/normal/plan/yolo；vault 范围、下一轮生效，yolo 标记高风险）+ 顶层有序权限规则编辑器（见下）。
- **context**：compaction（自动压缩、保留 Token 数、预留空间 buffer、压缩模型引用）；媒体与输出（图片自动缩放、宽/高/base64 限制、工具输出行数/字节上限、snapshots 开关）；warming disclosure（继承/关/开/自定义对象 + 成本提示，文案明确原生预热与插件会话预热相互独立）与实验性后台压缩；advanced sources disclosure：instructions/skills 来源按行编辑（纯字符串数组一行一条；含非字符串项的原生结构退化为高级 JSON；只配置发现来源，不写入任意来源文件）与技能目录只读列表。
- **tools**：页面顶部提供前往权限设置的快捷入口（点击共享二级导航的 permissions 页签，堆叠面回退为滚动定位）；commands 集合编辑器（description、必填多行 template、agent 选择（目录 agents，缺失退化文本）、模型引用、subagent 开关）；formatter JSON（任意形态，布尔/对象原样支持）disclosure。
- **mcp**：`mcp.servers` 集合编辑器，记录顶部明示同名声明整对象替换。每记录：transport 仅提供 local/remote（必填；未声明时显示禁用的 "Not set" 占位，不提供"继承"选项），切换时按记录 stash 旧类型声明及其字段 buffer，切回时恢复（共享未知键保留，类型专属字段互换），不再经该字段删除整条记录；local → command 多行 textarea（一行一个参数，首行必填）+ environment 键值对；remote → 必填 url + headers 键值对；必填的 type/command/url 不提供字段级还原；disabled 开关（停用/启用）；advanced：catalog/execution 超时（毫秒，≥ 1）与完整声明 JSON 对象编辑（绑定记录根，无字段级还原）。整台服务器的移除只经条目页脚确认流程。键值编辑拒绝空/重复/原型污染键，非字符串形态的存量值退化为 JSON 对象编辑。页面下方为运行时 MCP 连接 disclosure：目录服务器列表 + 连接/断开（`setMcpConnection`），状态只来自目录。
- **configuration**：references 集合编辑器——对象记录编辑 description/path/repository/branch；合法的字符串速记记录原样呈现实际路径，编辑保持字符串形态（不强制转为对象），每条记录另配作用域内的高级 JSON disclosure 承载 string|object 联合形态；列表摘要显示实际本地路径或仓库标识，无法判定时显示未知占位；plugins 来源数组；保存配置恢复 disclosure（见下）。
- **advanced**：原始 JSONC 暂存 textarea（改动只进 `rawDraft`，绝不自动应用）；Merge 校验为 JSONC 对象后整体替换草稿（清空字段 buffer、transport stash 与搜索词），Discard 丢弃暂存；未合并期间全部引导控件锁定（draft-lock 提示），两套表示不会互相漂移。advancedRuntime disclosure（watcher ignore 按行编辑、shell、worktree 目录、websearch JSON 布尔/对象原样支持）与 advancedPolicies disclosure（policies 有序数组）；experimental 组（todo、subagent_depth、portable_shell_scanner、location_idle_timeout 时长文本）；本工作区不暴露的字段说明；保存配置恢复 disclosure（见下）。

### 权限规则编辑器

- 集合式框架：标题 + 规则数量计数 + 右上"新增"（位于顶部，长列表无需滚动到底）；行内可见序号加粗显示（`legend` 仅作无障碍隐藏文本），上移/下移/移除工具条靠右。
- 行字段：action 下拉（read/edit/shell/subagent + glob/grep/webfetch/websearch/external_directory/skill/execute）或自定义 action 文本、resource 模式、effect allow/ask/deny；未知附加键经原始对象展开保留；新增种子 `{action:'read',resource:'*',effect:'ask'}`。按 v2 语义保存为有序数组（后匹配覆盖先匹配）。
- 规则数组提供作用域内的高级 JSON disclosure（`ruleJson`）；非数组或含非对象条目时退化为 raw JSON 字段编辑。

### 校验与应用

- 页脚（connection 除外）：live 保存状态区 + Discard（以存储设置重新对齐基线并清空全部 buffer/暂存）+ Apply，以及只读的当前覆盖草稿 JSON 预览 disclosure（查看将提交的完整草稿）。
- Apply 门：`draftErrors()` 为空且无 invalid buffer。draftErrors 覆盖：权限规则形状（顶层数组 + 每个 agent 的 `permissions`）、agent steps 整数 ≥ 1、command template 必填、MCP 记录（type 必填；local 的 command 为非空字符串数组且首参非空；remote 的 url 必填）、compaction buffer 非负安全整数 Token 或 1 ≤ x < 100 百分比字符串（可小数，与页内输入校验一致）。
- Apply 路径：`adapter.validateConfigContent(draft)` → `plugin.saveSettings()` → 采用存储的规范化文本为新基线（避免首尾空白被误判为外部修改）→ 把被顶替的旧 SAVED 值归档到机器本地恢复 → 强制目录重载。验证或保存失败保留草稿并回滚存储值，反馈如实报告；验证+保存成功但归档 IO 失败时保留新值并附加 history-unavailable 提示，不回滚、不谎报 apply 失败。

### 保存配置恢复（configuration 与 advanced 页均有入口；双入口为有意的兼容保留，非架构变化；advanced 为文档/测试入口）

- 恢复披露（`details.opencodian-opencode2-recovery`，列表/内联确认/`role="status"` 反馈）记录上一份 SAVED `opencode2.configContent`。归档委托 `core.agents.backend.configuration.BackendConfigRecoveryStore`：机器本地根 `~/.opencodian/backend-config-recovery`（绝不写入 vault、不参与同步），目录 0700 / 文件 0600；每目标 5 个槽位，最旧由 rename 顶替（无递归删除）；`wx`+uuid 临时文件原子 rename；symlink 或权限放宽路径在列表与写入时都拒绝。
- 每 vault 身份 `backendRecoveryIdentity(vaultPath, 'opencode2:configContent')`（sha256，要求绝对 vault 路径）；无稳定 vault 路径 → 恢复不可用（fail-closed，不写不列），不同 vault 永不共享命名空间，槽位 key 为 `opencode2-config-content`。
- 列表只渲染元数据（时间/字节，内容隐藏），密钥只存在于 0600 归档文件。revision 为归档字节 sha256；打开列表时对当前 `configContent` 做 CAS 快照，Confirm 与变更在同一同步点复检，stale 拒绝且不 save、不 adapter apply、不归档。恢复保持保存基线为当前值、仅草稿采用快照（`conflict()` 门不误判），随后重进 `validateConfigContent` 验证路径落盘；applyDraft 在保存成功后归档被顶替值（undo-of-undo，含空 overlay），不归档恢复值本身。
- 保存源与应用历史分离：vault 内 `configContent` 是唯一保存源（随 vault 同步）；机器本地归档是密钥敏感的应用历史，仅本机恢复使用。列表读取失败（普通文件/symlink/权限放宽的 base）降级为 `settings.backend.recovery.unavailable` 提示，不中断页面渲染；重开 disclosure 不清除既有反馈，只有新的恢复尝试清空。恢复文案在 en/zh locales（recovery 键 + 通用 unavailable 等）。
- 聚焦测试：`SettingsOpenCode2Workspace.test.ts`、`SettingsOpenCode2Recovery.test.ts`（fixture host 注入 `vaultPath`+`recoveryBaseDir`；真实 store + 真实 fs）。

## 概述

`SettingsBackendSection` 负责 `General > Agent Management` 设置面板。它管理当前已实现 agent backend 的启用范围与当前 active agent，并在任意 backend 开关变化时以 best-effort 方式同步 runtime 生命周期（start/stop adapter）。切换默认 backend 只启动新 adapter；仍启用的旧 adapter 保留给现有会话。

2026-06-28：本 section 同步纳入智能体管理 Settings UI 第一阶段重构。它是截图中 `通用 > 智能体管理` 的真实 owner，现在复用 agent settings control surface：外层挂载 `.opencodian-agent-settings-shell.opencodian-backend-agent-surface`，默认智能体使用 compact Form/Card row，已启用智能体列表使用 scroll/list 风格的低调数据行，状态通过 badge 与 `data-backend-agent-*` 属性表达，而不是把 active/enabled/off 文案塞进大卡片或重复标题。

## 职责

- 渲染 active backend 的下拉选择，选项来自当前 enabled backend 列表；切换后会刷新设置页，让 tabbed settings surface 立即进入对应 backend 的专属设置面
- 在默认 backend 行旁渲染 R-F4 `chatWarmSessionEnabled` 普通 toggle：仅预热当前聊天 backend 的空只读 aux session，不发 prompt/turn、不产生模型计费；真实聊天另建自己的会话
- 通过 `IMPLEMENTED_AGENT_BACKENDS` 过滤已知 backend，渲染所有已实现的 backend 开关（`opencode`、`opencode2`、`claude-code`、`codex`、`copilot`、`pi`、`zcode`、`dsh`）
- 为 backend 管理 surface 输出稳定样式与 QA 选择器：`.opencodian-backend-agent-surface`、`.opencodian-backend-agent-list`、`.opencodian-backend-agent-row`、`data-backend-agent-id`、`data-backend-agent-active`、`data-backend-agent-enabled`
- 在 backend 行标题旁追加低调 badge：active、enabled、disabled。行标题本身只保留 backend 名称，避免重复朗读和视觉噪音
- 导出 `BACKEND_OPTIONS`，让 agent switcher 复用同一组已实现 backend id 与 locale key
- 允许所有 backend 被禁用，并在没有 enabled backend 时显示空状态提示
- 在当前 active backend 被禁用时回退到 enabled 列表中的第一个 backend
- 更新设置时同步 `AgentServiceRegistry` 的 enabled/active 状态，触发聊天视图的 active-backend change 监听
- **通用生命周期**：启用/禁用任意 backend 时调用对应 adapter 的 `start()`/`stop()`；OpenCode 在 adapter 不存在时回退到 `openCodeService`
- **Active 切换生命周期**：切换 active backend 时启动新 adapter，保留其他已启用 adapter 的运行状态

## 公共导出

- `BACKEND_OPTIONS`: 从内部已知 backend 列表按 `IMPLEMENTED_AGENT_BACKENDS` 过滤后的设置页选项，包含 backend id、名称 locale key 和描述 locale key。
- `SettingsBackendSection`: 设置 section class，构造参数包含 `plugin` 与 `requestDisplayRefresh()`；调用 `attach()` 挂载默认 backend 下拉与 enabled backend 开关。
- `SettingsOpenCode2Section`: OpenCode 2 九页工作区 section class；tabbed 宿主调用 `attachTabbed(containerEl, secondaryTabId)`，构造参数另含 `vaultPath` 与 `renderTitleSettings`。
- `createSettingsDshSection(plugin)`: 在本 owner 内组装 DSH 设置区宿主（设置读写、适配器窄控制面、统一 MCP 校验注入），使 settings shell 不直接 import DSH 运行时协议。
- `getSettingsCatalogFailureMessage(error)`: 后端管理面与 OpenCode 2 工作区共享的目录失败固定脱敏分类文案，从不回显原始错误。

## 集成

- `SettingsTabbedRenderer`: 在 `general/agents` 二级标签下创建并挂载本 section；opencode2 主 tab 下按二级页挂载 `SettingsOpenCode2Section`
- `OpenCodianSettings.activeBackend`: 保存当前 active backend，决定新会话创建、设置 tab 可见性和聊天 view 的 backend surface 切换
- `OpenCodianSettings.enabledBackends`: 保存启用 backend 范围，并在读取/渲染时过滤到已实现 backend
- `AgentServiceRegistry`: 同步 active backend、enabled backend 状态，并通过 `get(kind)` 管理所有 adapter 的 start/stop 生命周期
- `OpenCodeService`: 当 OpenCode registry adapter 不存在时作为 start/stop fallback

## 维护约束

- 展示文案必须通过 `t()` 和 locale key 获取，避免硬编码 UI 字符串
- 非 OpenCode backend 只有加入 `IMPLEMENTED_AGENT_BACKENDS` 后才应出现在本 section
- 样式只允许走 agent settings control surface，不应重新引入大色块、重阴影、嵌套卡片或 Sheet/Drawer 流程
- badge 只表达状态，不改变 backend 启用、active fallback、adapter lifecycle 或保存逻辑
- 任意 backend 的 start/stop 均为 best-effort：失败不应阻止设置保存或 UI 刷新
- 默认 backend 切换不得终止其他 tab 的请求；禁用 backend 时停止其 adapter，包括先前启动、现已非默认的 adapter
- 默认 backend 下拉或禁用 active backend 的 fallback 改变 active backend 后，必须调用 plugin 的 `onChatWarmSessionBackendChanged()`；R-F4 开启时由组合根排他地替换旧预热 session

## 2026-09-08 Pi 独立服务接入

Pi 加入已实现后端选择。仅启用 Pi 时挂载独立 SettingsPiSection，既有启停逻辑不变。

2026-09-09：通用智能体页只负责启停/默认后端，移除内联Pi配置；Pi配置在独立后端标签。

2026-09-22：ZCode 加入已实现后端选择（`settings.agent.name.zcode` / `settings.agent.zcode.desc`）；启用/禁用不影响其他后端的启停语义。

## 2026-09-27 OpenCode 2 compatibility

The backend list exposes OpenCode 1 and 2 separately; OpenCode 2 settings select local executable or remote URL/password.

2026-10-07: OpenCode 2 catalog reads keep fixed denied/unavailable/failed state text and data-catalog-state. Raw upstream exception messages are not rendered in this catalog read surface.


## 2026-10-08 后台会话与默认后端切换

默认后端选择只决定新会话/设置路由，保留其他已启用 adapter，避免中断后台 tab。禁用该后端和插件卸载负责释放资源；设置页头部按钮与默认后端下拉使用相同语义。两台桌面的长工具调用、目标取消/续聊及后端切换需单独验证，不能由设置 ACK 推断。


## 2026-10-23 DSH backend

后端启用列表新增 DeepSeek Harness。启用后显示 CLI/桌面包路径、工作目录及“测试连接”；空路径走自动发现，空目录使用当前 vault。测试连接只启动适配器并读取状态，不创建会话或发送模型提示。控件挂载不订阅持久状态回调，避免设置页重建后残留 DOM listener。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/backends/opencode/SettingsBackendSection.ts`。
- 原位置：`src/features/settings/SettingsBackendSection.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/core/agents/backend/opencode/OpenCode2Adapter.ts`。

## 2026-10-24 DSH 设置区分离

后端启用/默认选择组合层将 DSH 的完整设置区交给 `SettingsDshSection`，仅注入设置读写、适配器窄控制面和统一 MCP 校验。保留原有 OpenCode 2 管理行为，避免把多个后端的设置逻辑继续堆入此模块。

> 2026-10-27：通用智能体管理只保留默认后端、启用开关和共用预热策略；OpenCode 2/DSH 专属配置移到各自工作区，并新增共享脱敏的 catalog 失败分类 helper。
