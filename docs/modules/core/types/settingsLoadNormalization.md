# Settings Load Normalization
> 2026-09-21 (advantage-parity R-F7)：load 合流点经 `normalizeEnvironmentVariablesDomains` 归一化 `environmentVariables`（键/值裁剪、空键与非字符串值丢弃、providers 键规整）。
> 2026-09-21 (advantage-parity R-F8)：load 合流点消费 normalizeModelContextWindowOverrides。
> 2026-09-21 (advantage-parity R-E4)：词面检索归一化块并入语义三字段。
> 2026-09-21 (advantage-parity R-D3)：load 合流点新增两个提示音字段的归一化消费。
> 2026-09-20 (advantage-parity R-D1)：load 合流点新增 `conversationExport: normalizeConversationExportSettings(...)`，旧快照缺字段时落到默认值。
> 2026-09-18 (R-C6): 新增 file-local `normalizeRemoteControlSettingsOnLoad()`（合并入最终 merge boundary）：`remoteControlEnabled`（非 `true` 一律回落 `false`）、`remoteControlBindAddress`（`localhost` 归一为 `127.0.0.1`，空/超长/错型回落默认）、`remoteControlToken`（仅字符串且 ≤200 字符，否则空——关闭不清令牌，吊销只走重新生成）、`remoteControlNonLoopbackAcknowledgedAt`（错型/超长清空，损坏的确认串不能顶替用户显式确认）。
> 2026-09-18 (R-B3): R-B3 load normalization: `normalizeEditRevertSettingsOnLoad()` (file-local helper) materializes `editRevertEnabled` and the clamped `editRevertSnapshotLimitMb` at the final merge boundary; a stale or hand-edited value falls back to the default.
> 2026-09-18 (R-B1/R-B2): the final merge normalizes `autoInternalLinkEnabled`, `autoInternalLinkExcludedTerms` and `contextGroups` so stale or hand-edited snapshots materialize safe defaults.

> **源码**: `src/core/types/settingsLoadNormalization.ts`
> **状态**: [REVIEW]

## 概述

R-C4：`normalizeVaultRetrievalSettingsOnLoad` 的返回类型与合并输出新增 `pdfIndexEnabled`（非布尔回落默认 `false`）。


`settingsLoadNormalization.ts` 收束插件启动时的 persisted-settings bootstrap seam。它把 `main.ts` 里原本混杂的 core/ui snapshot merge、历史 server 结构迁移、theme/chat appearance 恢复、input panel legacy reset，以及“本次启动后是否要立刻回写归一化设置”的判定集中到单一 owner。

这个模块不负责真正读写文件，也不负责 Obsidian 插件装配；它只把 `StorageService.loadPersistedSettings()` 的结果变成 `OpenCodianPlugin.loadSettings()` 可直接消费的 bootstrap state。

2026-09-18（R-C1）：`normalizeVaultRetrievalSettingsOnLoad` 在最终 merge 边界归一化整库检索四设置项（enabled 布尔、topK/maxChars 越界回默认、excludedPaths 清洗去重），旧快照缺字段时落到 `DEFAULT_SETTINGS` 安全默认。

## 导入关系

```text
上游:
- `src/core/storage/index.ts` (`SettingsLoadResult`)
- `src/core/agents/backend/index.ts` (`IMPLEMENTED_AGENT_BACKENDS`)
- `src/core/theme/*`
- `src/core/types/settings.ts`

下游:
- `src/main.ts`
```

## 核心类型 / 状态

- `LoadedSettingsSnapshot`: 合并 `settings.core.json` / `settings.ui.json` 后的临时快照，同时兼容 legacy flat server 与废弃字段。
- `LoadSettingsNormalizationContext`: 聚合 server/theme/chat appearance/tab/input-panel 的归一化结果，供最终 settings 装配复用。
- `LoadSettingsBootstrapState`: `prepareLoadedSettingsBootstrapState()` 的返回值，包含 `settings`、原始 `persistedSettings`、migration flags 以及 `shouldPersistNormalizedSettings` 判定。

## 核心逻辑

### `prepareLoadedSettingsBootstrapState()`

唯一公开入口，完成：

1. 合并分层持久化快照；
2. 归一化 server/theme/chat appearance/input-panel/question/debug/backend/tabbed-layout 及回合变更记录显示开关等启动设置；缺失或非布尔值的 `showTurnChangeRecords` 回退为 `true`，缺失或非布尔值的 `pluginUpdateAutoInstall` 回退为 `false`；
3. 计算 legacy local port 与 glass defaults migration 是否命中；
4. 生成最终 `OpenCodianSettings`；
5. 决定本次启动是否需要把归一化结果立即写回磁盘。

Capability Lab 的 `capabilityLabSelectedBackend` 在最终 settings merge 时通过 `normalizeCapabilityLabSelectedBackend()` 清洗。任意非空 descriptor id 会被 trim 后保留，使未来 backend 不需要修改启动归一化白名单；当前不存在的 id 由 tabs controller 对照 descriptor 集忽略，再按 `activeBackend` → descriptor 第一项解析初始选择。该字段不会参与 active backend 或 enabled backend 归一化。

最终 settings merge 会用 `IMPLEMENTED_AGENT_BACKENDS` 过滤 `enabledBackends`，并在 `activeBackend` 不在 enabled 列表中时回退到第一个 enabled backend。当前实现只保留 `opencode`，避免旧快照或手写设置启用尚未接入的 backend。`backendSettings.claudeCode` 仍会归一化并持久保留，作为隐藏 foundation，不能因此把 Claude 暴露成已实现 backend；该最终 merge 边界也会重新调用 `normalizeBackendSettings()`，确保旧 snapshot 缺失的 `claudeCode.sessionTrace` 补齐默认值、五个 channel map、合法 console preset 与 trim 后的 storage directory。

### server / theme / input-panel 迁移

- `normalizeServerSettingsOnLoad()` 兼容旧的扁平 `server.{host,port,autoStart}` 结构，并保留 legacy `4096` → local sidecar 默认端口迁移信号。嵌套 server 设置中的 `local.executablePath` 会被 trim；旧扁平结构统一回填为空字符串，表示继续自动探测。
- `normalizeThemeAndChatAppearanceOnLoad()` 保持 preset-backed theme 与生效 `chatAppearance` 的恢复顺序，并保留背景图字段。
- `normalizeInputPanelSettingsOnLoad()` 继续处理 glass/card/pill 默认层级 reset，以及 legacy `nikdelvin` 默认档案回填。

## 与其他模块的交互

- 依赖 `settings.ts` 的 `normalize*` / `getDefault*` 工具函数，但不把这些纯函数重新包装成新的 facade。
- Claude Code backend settings 在启动期通过 `normalizeBackendSettings()` 清洗：`settingSources` 默认 `['project']`，显式空数组保留为空，invalid permission/thinking/effort/additionalDirectories 回退安全默认；`sessionTrace` 使用 `CLAUDE_TRACE_CHANNEL_IDS` 重建完整 map，`enabled !== false` 保持默认开启，只有 `off|standard|full` 是有效 console preset，storage directory 会 trim。
- 会话标签启用状态通过 `normalizeTabsEnabled()` 在启动快照构建阶段清洗一次，只有持久化值明确为 `false` 才禁用；最终 settings merge 直接使用该归一化结果或默认值，避免重复清洗和历史设置误关标签入口。
- 依赖 `core/theme` 的 preset 解析与 appearance override 计算，确保 theme startup 顺序与原逻辑一致。
- 依赖 `core/agents/backend` 的 `IMPLEMENTED_AGENT_BACKENDS` 清洗 backend 设置，使新安装和旧设置都只落到已实现 backend。
- 被 `main.ts` 调用后，`loadSettings()` 只负责状态落位、可写性标记与必要的持久化回写。

## 注意事项

- 这里只处理启动期 bootstrap normalization；保存路径、UI refresh、locale/theme side effects 仍在 `main.ts`。
- 不能改变 conversation preload、plugin load order、provider/model disable layering 或 locale keys。
- `disabledPluginSpecs` 在启动归一化时保持为清洗后的字符串列表，供插件管理快照合并项目插件禁用状态。

## 2026-04-23 Compaction config alignment

Ownership facts:

1. Compaction config is project-scoped and stored in `.opencode/opencode.json`.
2. Conversation session settings no longer own compaction, and `OpenCodianSettings` no longer normalizes `autoCompactionEnabled` / `compactionReservedTokens` during bootstrap.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control, not a settings bootstrap concern.

## 2026-04-24 Dual-layout mode bootstrap

`resolveInitialLayoutMode()` was added to decide the layout mode on plugin start:

- If `settingsLayoutMode` is explicitly saved, use the normalized value
- If settings exist (existing user) but no explicit layout mode, default to `'classic'` to avoid forced migration
- If no saved settings at all (fresh install), return the `DEFAULT_SETTINGS` value (`'tabbed'`)

`normalizeLoadedPluginSettings()` now also normalizes `settingsTabbedPrimaryTab` (with `'server'` fallback) and `settingsTabbedSecondaryTabByPrimary` from saved snapshots during bootstrap.

It also migrates the old `Server > MCP` remembered location into the new top-level `MCP` tab. A saved snapshot like `{ settingsTabbedPrimaryTab: 'server', settingsTabbedSecondaryTabByPrimary: { server: 'mcp' } }` now becomes `settingsTabbedPrimaryTab: 'mcp'` with `settingsTabbedSecondaryTabByPrimary.mcp = 'overview'`.

- 2026-09-13: 加载归一化接入 memory: normalizeMemoryBackendUserSettings。

- 2026-09-15: 在最终合并边界补上 `inlineEditEnabled` 与 `inlineEditModelOverrides` 的归一化，使旧设置快照也能得到完整字段。

- 2026-09-18（R-A1 / R-A2）: 最终合并边界补上 `inlineEditTriggerAt`（boolean，缺失回退 `false`）与 `inlineEditPresetPrompts`（`normalizeInlineEditPresetPrompts`）的归一化，使旧设置快照也能得到完整字段。


> 2026-09-18 (R-A5/R-A6)：加载归一化接入 `inlineEditMaxConcurrentEdits`（clamp）与 `inlineEditDocumentModeEnabled`（布尔，缺省 true）。

## 维护约束

- 2026-09-18 (FlowText R-B4): Obsidian 原生工具注入接缝接入——载入归一化新增 normalizeObsidianToolingSettingsOnLoad：未知/陈旧模式值在最终合并边界回退 off（手改配置文件不能静默激活能力）。

## R-C2 扩展

2026-09-18 新增 `normalizeImageGenerationSettingsOnLoad`（最终 load-merge 边界）：models 列表归一化、宽度钳制、cleanup 回退 'trash'。

> 2026-09-18 (R-C3)：加载归一化新增 `inlineCompletionEnabled`（布尔回退默认 false）与 `inlineCompletionMaxChars`（经 `normalizeInlineCompletionMaxChars` clamp）两条迁移路径。

> 2026-09-19 (R-C3 补全专用模型覆盖)：`normalizeInlineCompletionSettingsOnLoad` 增加第三条路径 `inlineCompletionModelOverrides`（经 `normalizeInlineCompletionModelOverrides` 归一化）——快照缺键时物化为空默认，保证补全模型解析链与该设置存在之前逐字节一致；持久化映射按已知 backend + 非空字符串裁剪，畸形值（非字符串、纯空白、未知 backend）全部丢弃。
