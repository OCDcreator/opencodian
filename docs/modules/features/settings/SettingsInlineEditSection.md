# SettingsInlineEditSection
> 2026-09-18 (R-B1): adds the auto-internal-link toggle (`autoInternalLinkEnabled`) and the excluded-terms textarea (`autoInternalLinkExcludedTerms`, one term per line, normalized on save).

> **源码**: `src/features/settings/SettingsInlineEditSection.ts`
> **状态**: [REVIEW]

## 概述

行内编辑（inline edit）的设置分节，呈现 `docs/requirements/inline-edit.md` §9 与 `docs/requirements/flowtext-parity.md` R-A1/R-A2 定义的设置项。

## 职责

- `inlineEditEnabled` 总开关：关闭时 `inline-edit` 命令与编辑器右键菜单项一并隐藏（`editorCheckCallback` 返回 false）
- `inlineEditSelectionAffordance`：选区悬浮按钮开关
- `inlineEditTriggerAt`（R-A1）：`@` 键唤起行内编辑的开关（默认关）；同区块展示「命令快捷键」发现性行——`inline-edit` 命令默认不绑定热键，文案如实说明并给出「前往热键设置」按钮（选项注入 `openHotkeySettings`，由 `OpenCodianSettings` 用 Obsidian 未文档化的 `app.setting.open()` + `openTabById('hotkeys')` 实现，tab 切换带 try/catch 防 DOM 未就绪竞态）
- `inlineEditPresetPrompts`（R-A2）：用户自定义 `#` 预设的增删改——「添加预设」按钮追加空行（label + prompt 两个输入框 + 删除按钮），行内编辑即保存；半成品（空 label/prompt）条目会话内保留可编辑，加载归一化（`normalizeInlineEditPresetPrompts`）在下次启动时剪除，菜单合成层（`listEffectiveInlineEditPresets`）过滤其显示；预设列表 UI 与设置存储的归一化刻意分离，避免输入中途行被剪导致焦点丢失
- `inlineEditModelOverrides` 按 backend 键控的模型覆盖：**每个已启用 backend 一行输入**，而不是一个全局字段，避免为不使用的 backend 留下会静默生效的陈旧值
- 输入即校验：值不符合该 backend 的引用格式时**不写入设置**，并把该行描述替换为错误提示（设计 §9 要求"显式配置但解析失败必须报错，不得静默切换"）
- 计费说明行：明确行内编辑不计入本插件的会话消息/上下文/成本统计，但供应商侧仍照常计费（§8.5 的裁决）
- 双布局挂载：classic 布局由 `OpenCodianSettings.renderClassicDisplay` 调 `attach()`；tabbed 布局由 `SettingsTabbedRenderer.renderConversationContent` 调 `attachTabbed()`，渲染进 conversation 主标签下 `inline-edit` 次级页的 `data-section-block`（在会话 section 之后创建，避免其 showActiveBlock 隐藏本块）

## 依赖

- `../../core/types`：`OpenCodianSettings`、`normalizeInlineEditModelOverrides`、`InlineEditPresetPrompt`
- `../inline-edit/InlineEditPluginHost`：`parseModelOverride`（按 backend 的格式校验）
- `obsidian`、`src/i18n`

> 2026-09-18 (R-A5/R-A6)：新增「全文修改模式」开关（`inlineEditDocumentModeEnabled`）与「并行行内编辑上限」滑条（1–8，写入前经 `normalizeInlineEditMaxConcurrentEdits` clamp；说明文案明确每个并行编辑同时消耗一个独立模型会话）。

## 维护约束

- 覆盖值格式随 backend 变化（opencode/pi 为 `provider/model`，claude-code / codex 为单个 model 字符串）；新增 backend 时同步本文件的 `OVERRIDE_BACKENDS` 与 `overrideExample()`
- 校验逻辑必须复用 `parseModelOverride`，不要在设置层另写一套格式判断
- 只展示 `enabledBackends` 中的 backend，保持设置面与运行时可用后端一致
- 保存走 `plugin.saveSettings()` 并经过 `normalizeInlineEditModelOverrides`，保证落盘的永远是归一化后的映射

> 2026-09-18 (R-C3)：新增补全设置组——`inlineCompletionEnabled` 开关（默认关，文案说明开启后每后端保留 1 个预热只读会话、空闲 5 分钟释放）、`inlineCompletionMaxChars` 滑条（50–2000，经 `normalizeInlineCompletionMaxChars`）、触发方式说明行；host 契约新增 `onInlineCompletionSettingChanged(enabled)`，关闭时由插件立即 dispose 全部会话（验收 7 口径）。

> 2026-09-19 (R-C3 补全专用模型覆盖)：补全设置组内新增 `inlineCompletionModelOverrides` 每已启用 backend 一行输入（`addCompletionModelOverrideRow`）——语义与校验完全复用行内编辑覆盖行（空 = 继承既有解析链；格式非法不落盘、描述行换错误提示；保存经 `normalizeInlineCompletionModelOverrides`），仅消费方不同：只被补全池的模型解析读取（`resolveCompletionOverride` 优先于行内编辑链），因此可以单独为补全钉一个低延迟模型而不改行内编辑。文案（双语）如实说明补全对延迟敏感、推荐使用响应快的模型，不承诺具体毫秒数。
