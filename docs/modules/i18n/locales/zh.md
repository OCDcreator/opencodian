# Chinese Locale

> **源码**: `src/i18n/locales/zh.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的简体中文翻译表，导出 `zhTranslations` 静态对象。它覆盖插件设置、聊天交互、状态提示、帮助说明和 Liquid Glass 参数解释，是中文界面的主要文案来源。最近几轮先后扩展了会话设置弹窗分组布局相关键、项目级 compaction notice 键，以及主设置页 conversation section 的二级分组标题/描述键（会话标题、阅读与显示、提问交互、消息渲染）。

最近一轮还重写了 `settings.security.*` 相关文案：把原先容易让人误以为是上游原生“权限模式”的 wording，改成 **OpenCodian 权限模板 + 配置摘要** 语义，并补齐了 security section 的重启 tooltip / notice 键。

2026-04-24 的这一轮还补了一组 `settings.commands.*` / `settings.quickNav.commandsDesc` 文案，把 Commands settings 的说法对齐到当前 slash runtime truth：仅项目配置的 command 只是“已写入项目配置、等待 runtime 暴露”的草稿，skill mode 只改变 `/skill` 与 `/skills <skill>` 的入口形态，而命令级 `Temperature` / `Top P` 则用“隐藏辅助代理”的大白话来解释背后的实现。

同一天的后续 UI 微调还新增了 `settings.agents.editor.group.*` 文案，并把 `settings.agents.catalog.desc` 改成正向可见性语义，明确说明 agent catalog 中的子代理开关现在是 **开 = 在 `@` 菜单显示 / 关 = 隐藏**。

当前 A4 agent-surface 收尾还补了一组 `settings.agents.expert.*`、`settings.agents.workspace.*`、`settings.agents.guard.*`、`settings.agents.editor.select.runtimeSection` / `systemBadge` 以及 `settings.agents.tab.workspace` 文案，把 system-agent 专家模式、Markdown workspace CRUD / 状态、runtime/system editor 标签与新的 workspace 二级标签都收进 locale，避免继续在 settings owner 中硬编码用户可见文本。

2026-04-25 新增 `settings.server.tab.mcp` 和 `settings.server.mcp.*` 系列键，为 Server > MCP 设置标签页提供 MCP 服务器概览、状态徽章和刷新操作的中文文案。

同日 M2 继续扩展 `settings.server.mcp.*` 键空间，新增 MCP 操作按钮（连接 / 断开 / 认证 / 清除认证）、新增服务器表单（本地 / 远程类型切换、命令 / 环境变量 / URL / 请求头 / OAuth 等字段）、校验错误（nameRequired / nameDuplicate / commandRequired / urlRequired / urlInvalid / timeoutPositive / emptyKey）和操作反馈通知（added / addFailed / actionFailed）对应的中文文案。

同日 F2 新增 `settings.formatter.*` 和 `settings.quickNav.formatterDesc` 系列键，为 Formatter 一级设置页提供概览（runtime status / summary cards / detected formatter table）、配置（mode switch）和模式切换通知的中文文案。

同日 F3 扩展 `settings.formatter.config.*` 键空间，新增内置格式化器编辑（builtin list / action dropdown / override fields for command/environment/extensions）、自定义格式化器 CRUD（add / save / delete / nameConflict）、高级 JSON 编辑器（format / reload / save / invalidJson）和运行时离线提示对应的中文文案。

源码约 2050 行。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const zhTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'plugin.description': '在 Obsidian 中使用 OpenCode AI 助手',
  'settings.server.title': '服务器',
  'settings.server.mode.name': '连接模式',
  // ... 约 400+ 个键
};
```

## 核心逻辑

### 中文文案实现

该文件为英文键空间提供中文对应值，供 `setLocale('zh')` 后的全部界面使用。

### 帮助文案承载

除了普通 UI 标签外，这个文件还承载大量"解释型文案"，尤其是样式设置、主题背景与 Liquid Glass 参数的 plain-language help。

示例：
```typescript
'settings.style.input.liquidGlass.shuding.help.displacementScale':
  '这是最核心的"玻璃感强度"滑块。调高后，输入框后面的内容会被扭曲得更明显...',
```

### 翻译风格

- UI 标签：简洁、动词前置（如"发送消息"、"添加上下文"）
- 帮助文本：口语化、避免技术术语（如"调高后...会更明显"）
- 错误提示：明确、 actionable（如"请检查...后再试"）

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `zhTranslations` | 简体中文静态翻译表对象 |

## 数据流

不适用。运行时会在 `t(key)` 中按当前 locale 直接读取该字典。

```
setLocale('zh')
t('settings.server.started')
  → translations.zh['settings.server.started']  // "OpenCode 服务器已启动"
```

## 与其他模块的交互

- 被 [locales/index.md](./index.md) 聚合
- 被 [i18n/index.md](../index.md) 用于中文界面输出

## 配置项

无。

## 键前缀分布

| 前缀 | 数量级 | 说明 |
|------|--------|------|
| `settings.*` | 400+ | 设置界面（最大分组，含完整 debug logging 文案） |
| `chat.*` | 150+ | 聊天界面 |
| `plugin.*` | 2 | 插件基础信息 |

### 主要键域

- `settings.style.*` — 样式设置（含大量 Liquid Glass 参数说明）
- `settings.server.*` — 服务器设置（含帮助文本）
- `settings.model.*` — 模型设置
- `chat.context.*` — 上下文操作
- `chat.sessionSettings.*` — 会话级覆盖设置弹窗与保存结果提示（含 deferred backend apply notice）
- `chat.childSessionTree.*` — child-session tree header / open action / partial-graph 文案
- `chat.question.*` — 问题系统
- `chat.omo.*` — OMO 相关

## 注意事项

- 中文文案应保持与英文键空间一一对应，不要单边新增键
- 该文件很长，修改时优先按前缀搜索已有键，避免重复定义或局部风格漂移
- 帮助文本通常比英文版本更长（中文表达更 verbose）
- 参数插值 `{param}` 在中文语境中同样适用
- 保持与英文表键顺序一致，便于 diff 对比

## 说明型长文本组织

文件中的长文本主要分为：

1. **帮助文本**（`*.help.*`）: 多段落解释，用 `\n` 分隔
2. **描述文本**（`*.desc`）: 单行补充说明
3. **通知文本**: 带参数的提示信息
4. **选项标签**: 下拉菜单、单选按钮选项

## 同步检查清单

修改本文件时，请确保：
- [ ] 键名与 `en.ts` 完全一致
- [ ] 参数占位符 `{xxx}` 数量和名称一致
- [ ] 新增键同时在 `en.ts` 添加
- [ ] 帮助文本风格统一（口语化、第二人称）

## 2026-04-23 压缩配置对齐

压缩配置已改为项目级（`.opencode/opencode.json`）。Ownership facts:
1. 压缩配置真相源为 `.opencode/opencode.json`，而非插件设置或会话设置。
2. 会话级 `autoCompactionEnabled` / `compactionReservedTokens` locale 键已移除；新增项目级 `settings.conversation.compaction.*` 键。
3. 手动 `session.summarize()` 仍为 per-session 操作，不由本 locale 管理。

## 2026-04-23 Conversation settings grouping

主设置页的 conversation section 现在拆成多层级 block。Locale 侧新增：
1. `settings.titleGeneration.groupDesc`
2. `settings.conversation.display.*`
3. `settings.conversation.questions.*`
4. `settings.conversation.rendering.*`

## 2026-04-23 Conversation compaction help modal

会话设置里的“上下文压缩（项目级）”现在也支持按字段打开帮助弹窗。Locale 侧新增：
1. `settings.conversation.compaction.help.openDoc`
2. `settings.conversation.compaction.help.{whatItMeans|opencodeDefault|adjustmentEffect|moreNotes|tipsLabel}`
3. `settings.conversation.compaction.help.{auto|prune|tailTurns|preserveRecentTokens|reserved}.*`

## 2026-04-24 Settings dual-layout locale keys

New Chinese keys added for the tabbed settings layout:

- `settings.layoutMode.*` — 布局模式下拉选项（经典/标签）
- `settings.general.*` — 通用一级标签标题、基础/语言二级标签，以及 classic 模式分组文案
- `settings.model.availability.desc` — 现在合并了原先 toggle 持久化说明，模型可用性头部改成一条合并文案，不再上下两句分开显示
- `settings.language.tab.*` — 语言标签页标签
- `settings.server.tab.*` — 服务器二级标签（连接/认证/状态）
- `settings.model.tab.*` — 模型二级标签（常用/项目配置/可用性/工具）
- `settings.conversation.tab.*` — 对话二级标签（标题/压缩/显示/提问/渲染）
- `settings.agents.tab.*` — 代理二级标签（默认/目录/编辑器/workspace）
- `settings.commands.tab.*` — 命令二级标签（模式/编辑器/目录）
- `settings.plugins.tab.*` — 插件二级标签（概览/全局/项目目录/OMO）
- `settings.security.tab.*` — 安全二级标签（配置/权限/安全）
- `settings.ui.tab.*` — UI 二级标签（通用）
- `settings.style.tab.*` — 样式二级标签（预设/背景/布局/用户/助手/输入/滚动条/高级）
- `settings.debug.tab.*` — 调试二级标签（通用/模块/日志/操作）
- `settings.user.tab.*` — 用户二级标签（档案/提示词/标签）
