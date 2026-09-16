# SettingsInlineEditSection

> **源码**: `src/features/settings/SettingsInlineEditSection.ts`
> **状态**: [REVIEW]

## 概述

行内编辑（inline edit）的设置分节，呈现 `docs/requirements/inline-edit.md` §9 定义的两个设置项。

## 职责

- `inlineEditEnabled` 总开关：关闭时 `inline-edit` 命令与编辑器右键菜单项一并隐藏（`editorCheckCallback` 返回 false）
- `inlineEditModelOverrides` 按 backend 键控的模型覆盖：**每个已启用 backend 一行输入**，而不是一个全局字段，避免为不使用的 backend 留下会静默生效的陈旧值
- 输入即校验：值不符合该 backend 的引用格式时**不写入设置**，并把该行描述替换为错误提示（设计 §9 要求"显式配置但解析失败必须报错，不得静默切换"）
- 计费说明行：明确行内编辑不计入本插件的会话消息/上下文/成本统计，但供应商侧仍照常计费（§8.5 的裁决）
- 双布局挂载：classic 布局由 `OpenCodianSettings.renderClassicDisplay` 调 `attach()`；tabbed 布局由 `SettingsTabbedRenderer.renderConversationContent` 调 `attachTabbed()`，渲染进 conversation 主标签下 `inline-edit` 次级页的 `data-section-block`（在会话 section 之后创建，避免其 showActiveBlock 隐藏本块）

## 依赖

- `../../core/types`：`OpenCodianSettings`、`normalizeInlineEditModelOverrides`
- `../inline-edit/InlineEditPluginHost`：`parseModelOverride`（按 backend 的格式校验）
- `obsidian`、`src/i18n`

## 维护约束

- 覆盖值格式随 backend 变化（opencode/pi 为 `provider/model`，claude-code / codex 为单个 model 字符串）；新增 backend 时同步本文件的 `OVERRIDE_BACKENDS` 与 `overrideExample()`
- 校验逻辑必须复用 `parseModelOverride`，不要在设置层另写一套格式判断
- 只展示 `enabledBackends` 中的 backend，保持设置面与运行时可用后端一致
- 保存走 `plugin.saveSettings()` 并经过 `normalizeInlineEditModelOverrides`，保证落盘的永远是归一化后的映射
