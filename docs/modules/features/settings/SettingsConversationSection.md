# SettingsConversationSection

> **源码**: `src/features/settings/SettingsConversationSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsConversationSection` 是 settings/conversation 分区的厚 owner。它从 `OpenCodianSettings.ts` 接管 conversation section 的完整 lifecycle：标题生成模式与备用标题模型 picker、项目级 compaction 配置编辑、聊天字体大小、问题卡片显示/位置、已回答卡片显示，以及 user markup 渲染开关。

它必须按当前 active backend 过滤能力：聊天字体大小与 user markup 渲染是通用显示设置，Claude Code 和 OpenCode 都可以显示；项目级 compaction、会话分享与问答卡片当前都依赖 OpenCode 机制，只有 active backend 为 `opencode` 时才装配、加载模型目录或监听 `.opencode/opencode.json`。

会话标题分组现在对所有 backend 可见，但内容按 backend 切换：
- OpenCode active 时：title mode dropdown（first-message / smart）+ 备用 AI 标题模型 picker
- Claude Code active 时："Let Claude auto-generate titles" toggle（默认开启），控制新 Claude 会话是否让 SDK 自动生成摘要标题；关闭时固定使用 "New Claude Code chat" 作为显式标题

当前 conversation section 不再把不同职责的设置平铺成单层列表，而是复用主设置页的 `settings block` 语言拆成六个二级分组：

- 会话标题
- 上下文压缩（项目级）
- 会话分享（项目级）
- 阅读与显示
- 提问交互
- 消息渲染

其中“上下文压缩（项目级）”分组现在为每个压缩字段都挂了帮助按钮，点击后会打开 `ConversationCompactionHelpModal`，用通俗语言解释字段语义、OpenCode 默认策略和调参影响。

“会话分享（项目级）”分组使用独立的分享策略面板承载 share mode，而不是普通单行 setting。该面板保留项目配置帮助按钮，点击后打开 `OpenCodeProjectConfigHelpModal`。该弹窗说明分享会创建公开链接、不是 Markdown 导出，并链接 OpenCode share / config 官方文档。策略面板内还提供分享诊断区，可检查当前项目模式、OpenCode 服务健康状态，以及公共分享主机 `https://opncd.ai` 的网络可达性。策略面板下方是已分享会话管理区，显示公开会话数量、刷新动作、复制链接、预览和取消分享。

每个 conversation 二级分组都会标记稳定 `data-settings-target="conversation-{title|compaction|sharing|display|questions|rendering}"`，供会话设置弹窗和调试断言做深链定位；不要只依赖本地化标题文本匹配。

这个 owner 的职责边界刻意保持在"**conversation section 装配 + title-model refresh orchestration**"：

- 持有 conversation section 级别的 DOM 组装与设置写回
- 维护备用标题模型 `aiTitleModel` 的 availability-aware 标签解析与 warning action；智能标题会先等待 OpenCode 官方标题，只有未产出时才使用该备用模型
- 维护项目级 compaction 配置的读取、展示、输入校验与 `.opencode/opencode.json` 写入
- 维护项目级 `share` 配置的读取、展示与 `.opencode/opencode.json` 写入
- 维护 global chat font size 的输入校验、设置写回，以及保存后的当前聊天运行时重应用
- 协调 `ModelPickerModal` 与设置页的 title-model refresh callback 注册位
- 统一 question card / user markup 相关设置保存后的 conversation UI 刷新动作

## 核心逻辑

### section lifecycle 收束

`attach()` 会在一个 owner 内完成 conversation section 的主要阶段：

- 创建 section heading
- 通过 `OpenCodianSettings.createSettingsBlock()` 创建当前 backend 可用的 conversation 二级分组卡片
- 在“会话标题”块装配 title mode dropdown 与 AI title model picker
- 在“上下文压缩（项目级）”块装配 compaction controls
- 在“会话分享（项目级）”块装配 OpenCode `share` mode dropdown
- 在“阅读与显示”块装配 global session default chat font size
- 在“提问交互”块装配 question display mode、question card position、answered-card toggle
- 在“消息渲染”块装配 user markup 渲染 toggle
- 注册首次与后续模型目录变化时复用的 title-model refresh callback

这样 `OpenCodianSettings` 不再直接持有 conversation section 的 DOM/state/model-picker wiring，只保留 owner 创建、block 样式 seam 与 callback bridge。Claude Code active 时，classic 和 tabbed layout 都只显示显示/渲染类通用分组，不会启动 OpenCode title-model refresh、project config listener 或 share/compaction load。

### title-model refresh orchestration

owner 内部把 AI 标题模型的刷新链路集中起来：

- 读取 `ModelConfigService.getCatalogs()` 的 `baseEffective` / `effective`
- 用 `buildModelPickerGroups()` 构建 picker group
- 用 `resolveModelSelection()` 保留“当前已选但已不可用”的标签与 warning 状态
- 在模型不可用时保留当前选中值，并继续展示 warning action，而不是静默清空

这条链路保留了原有 follow-current 与 unavailable model 语义，同时把相关闭包从主设置类里收口出去。

### compaction config (project-scoped)

conversation section compaction controls now edit project `.opencode/opencode.json` directly, covering all upstream fields (`auto`, `prune`, `tail_turns`, `preserve_recent_tokens`, `reserved`):

- Read via `OpencodeConfigManager.getCompactionConfig()`
- Save via `OpencodeConfigManager.updateCompactionConfig(patch)`
- Numeric fields accept non-negative integers, including `0`; invalid negative/decimal/non-number edits reset the input back to the current valid UI value instead of leaving dirty text behind
- Saves are patch-shaped, so changing one field does not write the whole default compaction object and accidentally override inherited OpenCode defaults
- After write, call `OpenCodeService.reapplyCompactionConfigFromProjectConfig()` to reload sidecar
- While the settings tab is open, delegate `.opencode/opencode.json` `create` / `modify` / `delete` / `rename` watching to `ProjectConfigFileWatcher` and reload the project conversation controls when that file changes externally
- Show `configUnavailable` notice when config manager is missing
- Change callbacks re-check that OpenCode is still the active backend before mutating section-local compaction state, writing `.opencode/opencode.json`, or asking OpenCode to reapply compaction. This protects stale controls that were mounted while OpenCode was active but clicked after the active backend switched to Claude Code.

### share config (project-scoped)

The sharing block edits OpenCode's top-level `share` field:

- Read via `OpencodeConfigManager.getShareConfig()`
- Save via `OpencodeConfigManager.updateShareConfig(mode)`
- Supported modes are `manual`, `auto`, and `disabled`; missing or unrecognized values display as upstream default `manual`
- This is a project config setting, not a per-conversation session override
- After saving, local managed OpenCode services are restarted when currently running so the running server rereads `share`; remote mode shows the standard remote-management Notice instead of pretending the plugin can reload it
- The share setting is rendered inside a dedicated share-policy panel with a current-mode chip, a help button backed by `OpenCodeProjectConfigHelpModal`, and a footer-style progressively disclosed troubleshooting section. The troubleshooting section is collapsed by default (`<details>/<summary>`) to keep the stable sharing surface calm; its summary removes the default disclosure arrow, places the sharing setup check label on the left, and keeps the current diagnostic status chip on the right. When expanded, it shows connectivity checks for project mode, `OpenCodeService.checkHealth()`, and public share host reachability, with a "Check connectivity" button to run the probes
- The sharing block also renders a shared-session manager: it routes session listing through `listBackendSessions()` and message preview through `getBackendSessionPreview()` (backend-aware normalization helpers in `AgentBackendRouting`), using `NormalizedSessionRow` and `NormalizedSessionPreviewMessage` types instead of casting to OpenCode `Session` / `SessionMessage`. Sessions are filtered by `shareUrl`, showing a public-session count and refresh action, showing the public URL, supporting copy/unshare, and opening a full message preview. `shareUrl` is now populated only for active OpenCode session rows; Claude Code / generic adapters may still provide title/summary/message-preview data for inspection seams, but a compatible non-OpenCode `share.url` must not make a row appear in this OpenCode-only sharing surface. `unshareSession()` remains a direct `openCodeService` call because it is an OpenCode-specific write operation, and the unshare callback now has an explicit runtime guard (`isOpenCodeActive()`) that blocks the call if the active backend has switched away from OpenCode while the settings page is open.
- Share mode change callbacks and the share diagnostics button use the same early active-backend re-check as compaction controls, so stale mounted controls cannot update the policy chip / diagnostics, call `updateShareConfig()`, restart OpenCode, call `checkHealth()`, or probe the public share host after the active backend changes away from OpenCode.
- Shared-session previews render all messages; non-text parts and text longer than 800 characters are placed in closed `<details>` blocks so tool calls and long output are present but folded by default. If the backend cannot supply preview messages, the section shows the existing preview-failed text; if the backend responds with an empty history, the section shows a neutral empty-preview message instead of treating it as an error.
- A follow-up 2026-05-23 audit confirmed no additional backend-switch guards are needed for preview, refresh, count, or copy-link actions: preview/refresh already degrade safely through `AgentBackendRouting` (`null`/`[]`), stale sharing blocks are removed on standard settings re-render, and copy-link is a pure local UI action.
- 2026-05-24 follow-up narrowed the shared-session list boundary further: list rows are still normalized through `AgentBackendRouting`, but only OpenCode active backend rows can carry `shareUrl`; preview normalization coverage for generic/Claude-shaped payloads remains defensive and is exercised through OpenCode shared rows rather than by treating non-OpenCode `share.url` as a public OpenCode link.

### chat font size (global session default)

- Validate and normalize input before writing to `plugin.settings`
- Save via `plugin.saveSettings({ reloadModels: false })`
- After save, call `reapplyConversationSessionDefaults()` to apply effective chat font-size to CSS variable

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 构建并挂载 conversation section，注册 title-model refresh callback，并启动首次标题模型加载 |
| `dispose()` | 清理 settings tab 上注册的 title-model refresh callback、项目 `opencode.json` 监听，以及 owner 持有的按钮/setting 引用 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用 owner，向其提供 section heading seam、settings block seam 与 title-model refresh callback 注册位
- `ConversationCompactionHelpModal.ts`: 为 compaction 字段提供 topic-driven help modal
- `OpenCodeProjectConfigHelpModal.ts`: 为 share mode 提供用户可读解释和官方文档链接
- `main.ts`: 提供 `reapplyConversationSessionDefaults()`，把 settings 保存后的默认值变化桥接到当前聊天视图运行时
- `OpencodeConfigManager.ts`: 提供 `getCompactionConfig()` / `updateCompactionConfig()` 与 `getShareConfig()` / `updateShareConfig()` 读写项目 `.opencode/opencode.json` 中的 conversation 相关项目配置
- `OpenCodeService.ts`: 提供 `reapplyCompactionConfigFromProjectConfig()` 让 sidecar 重读项目配置，以及 shared-session unshare 所需的 `unshareSession()`
- `AgentBackendRouting.ts`: 提供 `listBackendSessions()` 和 `getBackendSessionPreview()` 用于 shared-session 列表和消息预览的 backend-aware 归一化路由，返回 `NormalizedSessionRow` / `NormalizedSessionPreviewMessage` 类型而非 OpenCode `Session` / `SessionMessage`
- `ProjectConfigFileWatcher.ts`: 监听当前 vault 的 `.opencode/opencode.json` 外部文件变更并触发项目 conversation 控件回读
- `ModelConfigService.ts`: 提供 AI 标题模型使用的有效模型目录
- `modelPicker.ts`: 构建并解析 AI 标题模型 picker group / 选项
- `ModelPickerModal.ts`: 提供 AI 标题模型的搜索式 picker

## 注意事项

- 不要改变 title model fallback、follow-current 语义、chat font-size 的即时重应用语义，或 question card refresh / conversation rendering 触发条件。
- 新增 conversation 选项时先判定是否后端无关。只改本地显示的选项可以在所有 backend 展示；任何读写 `.opencode/opencode.json`、调用 OpenCode session API、依赖 OpenCode title/question/share/compaction 语义的选项都必须继续只在 OpenCode active 时展示。
- 备用标题模型是 OpenCodian 智能标题的兜底模型，独立于 OpenCode 顶层 `small_model`；文案和 picker 说明必须继续保持这个边界。
- compaction 配置已改为项目级，不再从 plugin settings 或 conversation session settings 读取或写入。
- settings 页面打开期间，如果外部工具直接改动或删除 `.opencode/opencode.json`，项目级 compaction/share controls 会自动回读项目配置并刷新到最新状态；不需要手动重开设置页。
- 手动触发的 `session.summarize()` 是 per-session 操作，不受本项目配置 UI 管理。
- 如果后续继续推进 conversation lane，优先在这个 owner 内扩展完整 section lifecycle，而不是回到 `OpenCodianSettings` 主类里追加闭包。
- conversation section 的新增设置应先判断归属到哪个现有二级分组；只有在职责明显独立时才新增新的 block。
- 新增的 compaction 字段如果需要解释，优先继续复用现有 help-button + topic modal，而不是把长说明直接塞进 setting desc。

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. `SettingsConversationSection` writes compaction config directly to `.opencode/opencode.json` via `OpencodeConfigManager`; `autoCompactionEnabled` and `compactionReservedTokens` were removed from `OpenCodianSettings`.
3. Manual `session.summarize()` remains a per-session action available through session control, not managed by this configuration surface.

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `title` — renders title mode settings + AI title model picker
- `compaction` — renders project-scoped compaction controls
- `sharing` — renders project-scoped OpenCode share mode controls
- `display` — renders chat font size settings
- `questions` — renders question card display/position/answered-card toggles
- `rendering` — renders user markup render toggle

The classic `attach()` method remains the full-list owner, but both classic and tabbed paths now apply the same active-backend visibility rules.
