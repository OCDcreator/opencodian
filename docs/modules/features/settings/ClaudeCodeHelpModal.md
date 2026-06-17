# ClaudeCodeHelpModal

> **源码**: `src/features/settings/ClaudeCodeHelpModal.ts`
> **状态**: [REVIEW]
> **Updated**: 2026-06-18 — 新增。承载从 Claude Code 设置表面收敛的 boundary/lifecycle/proof 说明文字。

## 概述

Claude Code 设置项的帮助 Modal。当用户点击设置行末尾的 `help-circle` 按钮时打开，按 Boundary & evidence / When it takes effect / Verification status 三个段落展示该设置项的长文说明（boundary notice、lifecycle notice、proof-status 证据）。短文（lifecycle 1 句）已通过按钮 tooltip 即时可见；长文进入此 Modal，避免设置表面被密集说明文字淹没。

与 `ServerSettingHelpModal` 不同，本 Modal **不复制 locale 文案**：调用方（`SettingsClaudeCodeSection.attachSettingHelp`）直接传入已从既有 `settings.claudeCode.{settingKey}.boundaryNotice` / `.lifecycleNotice` / `proofStatus.*` key 解析好的字符串，保证说明文字单一来源、不会因并行 namespace 漂移。

## 导入关系

上游: `obsidian`（App、Modal）、`i18n`（仅 3 个段落 label key）
下游: 被 `SettingsClaudeCodeSection.attachSettingHelp()` 打开

## 核心类型 / 接口

```typescript
interface ClaudeCodeHelpContent {
  title: string;
  boundary?: string;
  lifecycle?: string;
  proofNote?: string;
}
```

## 核心逻辑

### 帮助内容渲染

`onOpen()` 构建 `opencodian-help-modal-shell`（复用 `config-editor-modal.css` 中已定义的共享 help 布局），渲染：
- `<h2>` title
- 可选 Boundary 段（`opencodian-help-modal-section` + `-card`）
- 可选 Lifecycle 段
- 可选 Verification status 段

每段仅在对应字段非空时渲染（`appendSection` 对 undefined 跳过）。

### 段落 label

三个段落标题使用固定 i18n key：
- `settings.claudeCode.help.boundaryLabel`
- `settings.claudeCode.help.lifecycleLabel`
- `settings.claudeCode.help.proofLabel`

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(app, content)` | 接收已解析好的帮助内容对象 |
| `onOpen()` | 渲染标题和三段帮助内容 |
| `onClose()` | 清空 contentEl |
| `appendSection(shellEl, heading, body)` | 渲染单个段落（body 为空时跳过） |

## 数据流

```
SettingsClaudeCodeSection.attachSettingHelp(setting, {boundaryText, lifecycleText, proofNote, helpTitle})
        ↓
ClaudeCodeHelpContent { title, boundary, lifecycle, proofNote }
        ↓
new ClaudeCodeHelpModal(app, content).open()
        ↓
opencodian-help-modal-shell + 三个可选 section/card
```

## 与其他模块的交互

- **SettingsClaudeCodeSection**: `attachSettingHelp()` 为每个带 boundary/lifecycle 的设置项创建 `help-circle` 按钮，点击打开本 Modal；同时创建 sr-only notice carrier 保留 `data-*` 属性与 textContent 供测试与无障碍访问。
- **i18n**: 仅 3 个段落 label key；正文文字由调用方从既有 notice key 解析后传入。

## 注意事项

- 不持有状态，渲染完全由构造时传入的 `content` 决定。
- 复用 `ServerSettingHelpModal` 已有的 `.opencodian-help-modal-shell` / `-section` / `-card` 布局类，不新增 Modal CSS。
- 不复制 locale 文案，避免双份维护漂移。
