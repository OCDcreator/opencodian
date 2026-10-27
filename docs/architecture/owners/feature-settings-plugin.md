# Owner: feature.settings-plugin
> 2026-09-21 (advantage-parity R-F6 质量修复)：三个 Vim 键输入共享重绘缝，显示值与设置真值恒等；冲突输入由 core.types 的单槽位契约拒绝并给出 notice，不再静默整体重置。
> 2026-09-21 (advantage-parity R-F5/R-F6)：SettingsConversationSection 的 Display 块新增默认关闭的会话 rail 与 Vim 导航 toggles、w/s/i 单字符配置；保存后复用既有聊天视图刷新缝，键值经 core.types 归一化，不在设置层持有会话或键监听器。
> 2026-09-21 (advantage-parity R-F8)：新增 ContextWindowOverrideModal（窄 port 不 import 应用层）+ 模型通用 tab 声明入口行。
> 2026-09-21 (advantage-parity R-E4)：整库检索块新增语义检索三行设置。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-20 (advantage-parity R-D1)：SettingsConversationSection 新增「导出」设置块（目录/模板/自动导出；目录走与导出器同一归一化器，非法恢复原值；路径类输入用 opencodian-wide-text-setting 宽输入）。

Update progress (2026-09-10): SettingsPluginUpdateSection renders service-owned phases and truthful completed-file counts in place, with an indeterminate progress bar while busy. It owns three-at-a-time history disclosure and focus behavior; shell lifecycle disposes subscriptions. It does not own install/download/rollback transactions.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): SettingsConversationSection renders the workspace-memory tab (4 settings rows).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/general/SettingsPluginSection.ts`, `src/features/settings/general/SettingsPluginEvidenceCoordinator.ts`, `src/features/settings/general/SettingsPluginEvidencePresenter.ts`, `src/features/settings/general/SettingsPluginUpdateSection.ts`, `src/features/settings/general/SettingsConversationSection.ts`, `src/features/settings/general/ConversationCompactionHelpModal.ts`, `src/features/settings/general/SettingsSecuritySection.ts`, `src/features/settings/general/SettingsFormatterSection.ts`, `src/features/settings/backends/acp/SettingsAcpSection.ts`, `src/features/settings/general/SettingsUiSection.ts`, `src/features/settings/general/SettingsUserSection.ts`, `src/features/settings/general/settingsBackendGuards.ts`, `src/features/settings/models/providerPresets.ts`, `src/features/settings/general/ModifiedFilesSidebarHelpModal.ts`, `src/features/settings/models/icons/ProviderBuiltinIconPickerModal.ts`, `src/features/settings/models/icons/ProviderIconCacheModal.ts`

## Responsibilities
- plugin, update, conversation, security, formatter, acp, ui and user settings sections
- plugin evidence coordinator/presenter, provider icon cache/picker modals, provider presets

## Entrypoints
- `src/features/settings/general/SettingsPluginSection.ts`
- `src/features/settings/general/SettingsPluginUpdateSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-icons`, `core.update`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `core.update`

## Focused tests
- `tests/unit/features/settings/**Plugin*`
- `tests/unit/features/settings/**Provider*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Conversation display preference:** `showTurnChangeRecords` defaults to enabled and controls only render visibility. Switching it off neither clears nor stops recording historical turn-change records.
- **Question UI refresh dedup:** the `questionCardPosition` and `showAnsweredQuestionCards` controls now share a single `refreshQuestionUi()` call; toggling both no longer fires two overlapping full conversation rerenders.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.settings-plugin retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

## Auto-install toggle (2026-09-09)

`SettingsPluginUpdateSection` renders the startup auto-install toggle bound to `settings.pluginUpdateAutoInstall` inside the status panel; toggling persists through the normal settings save path. Release validation, package writes and rollback remain with `core.update`.

## Builtin icon picker: models.dev library filter (2026-09-11)

`ProviderBuiltinIconPickerModal`'s library filter now offers `modelsdev` alongside `lobehub` and `opencode`, so the remote models.dev icon set can be browsed per library. Icon resolution itself stays in `shared.utils-icons`; the modal only renders and filters.
- 2026-09-13: 会话设置的工作区记忆块新增「共享记忆根目录」文本项（`memoryExternalRoot`），保存后立即通知 memoryRuntime 重建服务。

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.settings-plugin` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。


- 2026-10-21: OpenCode 1 退役——`settingsBackendGuards.resolveSettingsActiveBackend()` 的 null-settings 回退从 `opencode` 改为 `opencode2`，v1-owned settings section（Server/MCP/Tools/Formatter/Security）在默认状态下不再进入 OpenCode-owned mutation seam；覆盖 legacy v1 路径的测试需显式设置 `activeBackend: 'opencode'`。

## 目录定位（2026-10-23）

当前源码目录：`src/features/settings/backends/acp`、`src/features/settings/general`、`src/features/settings/models`、`src/features/settings/models/icons`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

> 2026-10-27：设置宿主调整后插件日志/诊断入口保持在通用调试；本 owner 的日志、更新与诊断边界未变。

> 2026-10-27（UI 验收修复）：会话标题备份模型按钮创建时同步设置当前模型或 followCurrent 标签；异步加载/不可用/保存语义不变。
