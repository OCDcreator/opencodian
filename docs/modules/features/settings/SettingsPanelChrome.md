# SettingsPanelChrome

> **源码**: `src/features/settings/SettingsPanelChrome.ts`
> **状态**: [REVIEW]

## 概述

`SettingsPanelChrome.ts` 承载主设置页的通用展示壳层逻辑，避免这些稳定的 DOM/格式化职责继续堆进 `OpenCodianSettings.ts`。

当前模块负责：

- 设置页顶部 brand title 渲染
- 通用 setting block 壳层
- setting name / description 的 inline-code 格式化
- help button 装配
- 语言切换 setting 渲染

## 主要导出

- `renderSettingsPanelTitle()`
- `renderLanguageSetting()`
- `createSettingsBlock()`
- `setSettingDescWithFormatting()`
- `setSettingNameWithFormatting()`
- `applyInlineCodeText()`
- `addSettingHelpButton()`
- `SettingHelpButtonConfig`
- `SettingsBlockOptions`

## 与其他模块的交互

- 由 `OpenCodianSettings.ts` 调用
- 通过 callback seam 给 `SettingsTabbedRenderer` 与多个 settings section owner 复用
- 文案仍来自 `../../i18n`

## Settings Layout Contract

`createSettingsBlock()` 同时输出 legacy 兼容 marker 与新的布局契约 marker：

- `.opencodian-settings-block` 保持为现有 CSS / 测试 / 调用方的兼容 class。
- `.opencodian-settings-section` 标记可见的 section surface。
- `data-settings-surface='section'` 给测试与后续 QA 提供稳定的 surface marker。
- `.opencodian-settings-section-body` 标记普通 setting row 接收 row-card styling 的 body 区域。

## 注意事项

- 这是展示壳层，不负责保存设置或跨 section 业务状态
- 资源路径解析继续依赖 `manifest.dir` 与 vault adapter `getResourcePath()`
