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
- **Include:** `src/features/settings/SettingsPluginSection.ts`, `src/features/settings/SettingsPluginEvidenceCoordinator.ts`, `src/features/settings/SettingsPluginEvidencePresenter.ts`, `src/features/settings/SettingsPluginUpdateSection.ts`, `src/features/settings/SettingsConversationSection.ts`, `src/features/settings/ConversationCompactionHelpModal.ts`, `src/features/settings/SettingsSecuritySection.ts`, `src/features/settings/SettingsFormatterSection.ts`, `src/features/settings/SettingsAcpSection.ts`, `src/features/settings/SettingsUiSection.ts`, `src/features/settings/SettingsUserSection.ts`, `src/features/settings/settingsBackendGuards.ts`, `src/features/settings/providerPresets.ts`, `src/features/settings/ModifiedFilesSidebarHelpModal.ts`, `src/features/settings/ProviderBuiltinIconPickerModal.ts`, `src/features/settings/ProviderIconCacheModal.ts`

## Responsibilities
- plugin, update, conversation, security, formatter, acp, ui and user settings sections
- plugin evidence coordinator/presenter, provider icon cache/picker modals, provider presets

## Entrypoints
- `src/features/settings/SettingsPluginSection.ts`
- `src/features/settings/SettingsPluginUpdateSection.ts`

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
