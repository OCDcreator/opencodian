# SettingsConversationSection

> **源码**: `src/features/settings/SettingsConversationSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsConversationSection` 是 settings/conversation 分区的厚 owner。它从 `OpenCodianSettings.ts` 接管 conversation section 的完整 lifecycle：标题生成模式与 AI 标题模型 picker、项目级 compaction 配置编辑、聊天字体大小、问题卡片显示/位置、已回答卡片显示，以及 user markup 渲染开关。

这个 owner 的职责边界刻意保持在"**conversation section 装配 + title-model refresh orchestration**"：

- 持有 conversation section 级别的 DOM 组装与设置写回
- 维护 `aiTitleModel` 的 availability-aware 标签解析与 warning action
- 维护项目级 compaction 配置的读取、展示、输入校验与 `.opencode/opencode.json` 写入
- 维护 global chat font size 的输入校验、设置写回，以及保存后的当前聊天运行时重应用
- 协调 `ModelPickerModal` 与设置页的 title-model refresh callback 注册位
- 统一 question card / user markup 相关设置保存后的 conversation UI 刷新动作

## 核心逻辑

### section lifecycle 收束

`attach()` 会在一个 owner 内完成 conversation section 的主要阶段：

- 创建 section heading
- 装配 title mode dropdown、AI title model picker 与 global session default controls
- 装配 question display mode、question card position、answered-card toggle
- 装配 user markup 渲染 toggle
- 注册首次与后续模型目录变化时复用的 title-model refresh callback

这样 `OpenCodianSettings` 不再直接持有 conversation section 的 DOM/state/model-picker wiring，只保留 owner 创建与 callback bridge。

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
- After write, call `OpenCodeService.reapplyCompactionConfigFromProjectConfig()` to reload sidecar
- Show `configUnavailable` notice when config manager is missing

### chat font size (global session default)

- Validate and normalize input before writing to `plugin.settings`
- Save via `plugin.saveSettings({ reloadModels: false })`
- After save, call `reapplyConversationSessionDefaults()` to apply effective chat font-size to CSS variable

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 构建并挂载 conversation section，注册 title-model refresh callback，并启动首次标题模型加载 |
| `dispose()` | 清理 settings tab 上注册的 title-model refresh callback 与 owner 持有的按钮/setting 引用 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用 owner，向其提供 section heading seam 与 title-model refresh callback 注册位
- `main.ts`: 提供 `reapplyConversationSessionDefaults()`，把 settings 保存后的默认值变化桥接到当前聊天视图运行时
- `OpencodeConfigManager.ts`: 提供 `getCompactionConfig()` / `updateCompactionConfig()` 读写项目 `.opencode/opencode.json` 中的 compaction 配置
- `OpenCodeService.ts`: 提供 `reapplyCompactionConfigFromProjectConfig()` 让 sidecar 重读项目配置
- `ModelConfigService.ts`: 提供 AI 标题模型使用的有效模型目录
- `modelPicker.ts`: 构建并解析 AI 标题模型 picker group / 选项
- `ModelPickerModal.ts`: 提供 AI 标题模型的搜索式 picker

## 注意事项

- 不要改变 title model fallback、follow-current 语义、chat font-size 的即时重应用语义，或 question card refresh / conversation rendering 触发条件。
- compaction 配置已改为项目级，不再从 plugin settings 或 conversation session settings 读取或写入。
- 手动触发的 `session.summarize()` 是 per-session 操作，不受本项目配置 UI 管理。
- 如果后续继续推进 conversation lane，优先在这个 owner 内扩展完整 section lifecycle，而不是回到 `OpenCodianSettings` 主类里追加闭包。

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. `SettingsConversationSection` writes compaction config directly to `.opencode/opencode.json` via `OpencodeConfigManager`; `autoCompactionEnabled` and `compactionReservedTokens` were removed from `OpenCodianSettings`.
3. Manual `session.summarize()` remains a per-session action available through session control, not managed by this configuration surface.
