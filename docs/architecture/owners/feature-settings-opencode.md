# Owner: feature.settings-opencode

2026-11-11 UI polish: page titles lead each task without the shared recovery strip. The three-field connection/default-permission backup appears once after Connection (also in classic layout), while JSONC history stays in its existing configuration/advanced surfaces. Service-information reads are named separately from saved/applied configuration. Inherited field badges are quiet by default; override and MCP unset semantics remain. File-wide shared draft, validation and conflict gates remain authoritative; footer state clean/pending/saving controls visual emphasis without changing persistence.

2026-11-11：OpenCode 2 工作区按九个功能页组织——`connection`、`model`、`agents`、`permissions`、`context`、`tools`、`mcp`、`configuration`、`advanced`；registry 旧 id 别名 `resources`/`extensions` → `configuration`、`catalog` → `advanced`、`auth`/`integrations`/`models` → `model`，`context` 为真实页面。同一插件实例共享目录缓存（30 秒 TTL）与本地进程覆盖草稿（saved/draft/rawDraft 三层，结构化 JSONC 更新保留未知字段与注释；无效输入按字段 buffer 暂存并阻止 apply）。编辑、目录同步、校验及应用反馈仍归本 owner 的 `SettingsBackendSection.ts`（`SettingsOpenCode2Section` 同文件），不新增跨模块运行时所有者。集合条目 = 原生目录 ∪ Vault 覆盖键；移除/还原只删除插件覆盖；继承读回只用真实目录值（agent 条目字段与 provider 模型名），不伪造默认值；保存先 `validateConfigContent` 验证后落盘，并把被顶替的 SAVED 值归档到机器本地恢复（见文末恢复历史一节）。专属 CSS 只影响 `.opencodian-opencode2-settings` 工作区。

设置工作区契约：否定布尔键改用语义选项（`hidden`=隐藏/显示、`disabled`=停用/启用，专属说明文案接入控件），默认智能体下拉的禁用判定计入原生目录 `disabled`；MCP transport 仅提供 local/remote（未声明显示禁用占位，不再经 transport 删除整条记录），必需的 type/command/url 与记录根字段（完整声明 JSON、references 记录）不提供字段级还原，整服务器移除只走条目页脚确认；references 字符串速记原样显示实际路径并在编辑时保持字符串形态（记录级高级 JSON 承载 string|object 联合）；instructions/skills/watcher ignore 纯字符串数组按行编辑，含非字符串项的存量退化 JSON；compaction buffer 收敛到原生值域（百分比 1 ≤ x < 100 可小数、Token 非负安全整数，页内与统一校验一致）；权限规则集合化（框架标题 + 计数 + 顶部新增 + 可见序号/无障碍隐藏 legend + 作用域高级 JSON）；工具页顶部新增前往权限设置快捷入口；各页页脚新增只读覆盖草稿 JSON 预览。恢复披露同时挂 configuration 与 advanced 双入口是有意的兼容保留，不构成架构变化。命令摘要：无 runtime 目录条目且无 description 的 commands 记录，列表摘要返回「尚未填写用途」（`collectionNoDescription`），不再使用通用运行目录回退；本轮其余为 CSS 视觉项与 locale 文案项，分属 CSS 与 locale 文档范围，不在本 owner 概述展开。
> 2026-10-24（DSH）：SettingsBackendSection 将 DSH 控件委托给现有 settings-shell owner 下的 SettingsDshSection；只组装设置/连接读取端口，MCP 校验复用 core.backend 的协议边界。
> 2026-09-22 (ZCode 票 01)：OpenCodianSettings 经典布局在 ZCode 激活时渲染 SettingsZCodeSection（与 pi 同模式）；设置面只读 adapter 诊断快照，不持有 ZCode 运行时状态。
> 2026-09-21 (advantage-parity R-F4)：SettingsBackendSection 在默认 backend 旁增加默认关闭的聊天预热 toggle；下拉切换与禁用 active backend 后的 fallback 通知组合根排他预热。设置面只发宿主命令，不持有 pool。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

Pricing readiness (2026-09-10): CostEstimateSettingsRow can refresh backend-specific catalog descriptions without reconstructing settings controls; subscription ownership remains in the settings shell.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/backends/opencode/SettingsBackendSection.ts`, `src/features/settings/backends/opencode/OpencodeConfigModal.ts`, `src/features/settings/backends/opencode/OpenCodeProjectConfigHelpModal.ts`, `src/features/settings/backends/opencode/projectAgentEditorConfig.ts`, `src/features/settings/backends/opencode/ProjectConfigFileWatcher.ts`, `src/features/settings/backends/opencode/SettingsProjectAgentEditor.ts`, `src/features/settings/backends/opencode/SettingsProjectCommandEditor.ts`, `src/features/settings/backends/opencode/SettingsServerSection.ts`, `src/features/settings/backends/opencode/ServerSettingHelpModal.ts`, `src/features/settings/backends/opencode/SettingsCommandsSection.ts`, `src/features/settings/backends/opencode/CostEstimateSettingsRow.ts`

## Responsibilities
- OpenCode backend/server sections, opencode config modal, project config help/file watcher
- project agent/command editors, commands section, cost estimate row

## Entrypoints
- `src/features/settings/backends/opencode/OpencodeConfigModal.ts`
- `src/features/settings/backends/opencode/SettingsServerSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.opencode`, `core.config`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `core.opencode`

## Focused tests
- `tests/unit/features/settings/**Opencode*`
- `tests/unit/features/settings/**Server*`
- `tests/unit/features/settings/SettingsOpenCode2Recovery.test.ts`（saved configContent 恢复历史：真实 store + 真实 fs fixtures）

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The shared backend chooser exposes Pi and mounts SettingsPiSection when enabled. Pi settings controls are owned by feature.settings-shell, not the OpenCode settings implementation.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

## 2026-09-27 OpenCode 2 compatibility

Settings expose OpenCode 1 and 2 separately and provide local executable or remote server controls for OpenCode 2.

2026-10-07: OpenCode 2 directory read controls render classified state and fixed bilingual text on failed/denied/absent endpoints.

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.settings-opencode` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 2026-10-23 DSH connection settings

既有 `SettingsBackendSection` 增加 DSH 启用项和可执行路径/工作目录/测试连接控件。控件只保存 core.types 设置或调用 core.backend 的 `start()`；不创建原生会话、发送模型提示或持有持久连接 listener。

## 目录定位（2026-10-23）

当前源码目录：`src/features/settings/backends/opencode`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

> 2026-10-27：`SettingsBackendSection` 只保留默认后端、启用开关与预热策略；OpenCode 2 连接/认证/MCP/资源工作区同 owner 托管（避免新增 settings SCC 成员）；catalog 失败使用固定脱敏分类。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `feature.settings-opencode` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## 2026-11-08 saved configContent 恢复历史（机器本地应用历史）

高级页新增 saved `configContent` 恢复披露；当前恢复披露同时渲染在 configuration 与 advanced 页（advanced 为文档与测试入口）。owner 边界不变——本 owner 只组装 UI 与保存编排，durable 副本全部委托给 `core.agents.backend.configuration.BackendConfigRecoveryStore`（core.backend configuration 家族）。非显然约束：

- **保存源 vs 应用历史**：vault 内插件设置的 `configContent` 是唯一保存源（随 vault 同步）；机器本地归档是密钥敏感的应用历史，仅用于本机恢复，两者永不混写。
- **身份与隔离**：`backendRecoveryIdentity(vaultPath, 'opencode2:configContent')` = sha256(`resolve(vaultPath)\nkind`)，要求绝对 vaultPath；无稳定 vault 路径 → 恢复不可用（fail-closed，不写不列）；不同 vault 不共享命名空间。
- **私有性限制**：机器本地根 `~/.opencodian/backend-config-recovery`，目录 0700 / 文件 0600，每目标 5 槽位、最旧由 rename 顶替（无递归删除）；symlink 或权限放宽的路径在列表与写入时都拒绝；写入走 `wx`+uuid 临时文件原子 rename。
- **revision CAS**：`revision` = 归档字节 sha256；列表元数据（时间/字节，"contents hidden"）只读，密钥不进 UI；打开列表时锁定当前保存源的 revision，Confirm 与变更同一同步点复检，stale 时拒绝且不 save、不 adapter apply、不归档。恢复确认保持保存基线为当前值、仅草稿采用快照，重进 `validateConfigContent` 验证路径；applyDraft 在保存成功后归档被顶替值（undo-of-undo，含空 overlay）。
- **失败语义**：save 失败 → 不归档；validate+save 成功但归档 IO 失败 → 保留新值并报 saved-but-history-unavailable，不回滚、不谎报 apply 失败；列表读取失败（unsafe base）→ 历史降级为 `settings.backend.recovery.unavailable`，advanced tab 保持可用。
- 恢复文案已并入 en/zh locales（22 个 recovery 键 + 通用 unavailable/applyFailed，parent humanized + merged）；验证测试为 `tests/unit/features/settings/SettingsOpenCode2Recovery.test.ts`（9 用例全绿），fixtures 为任务创建、保留于 worktree `node_modules/.cache/` 下的真实 fs 目录。
