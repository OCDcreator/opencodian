# InlineEditPresets

> **源码**: `src/features/inline-edit/InlineEditPresets.ts`
> **状态**: [REVIEW]

## 概述

R-A2 预设提示词目录的**数据层**：内置六条预设（扩展内容与例子 / 精简表达 / 翻译为指定语言 / 总结为 Markdown 表格 / 润色语气 / 修正错别字）与「内置 + 用户自定义」的合成规则。内置文案走 i18n（`inlineEdit.presets.<id>.{label,prompt}`），跟随 UI locale，因此**不能**落进 settings 静态存储；用户层是 `core.types` 的 `InlineEditPresetPrompt[]`（`inlineEditPresetPrompts`，默认空 = 仅内置）。

## 职责

- `INLINE_EDIT_BUILTIN_PRESET_IDS`：六个保留 id（`expand` / `condense` / `translate` / `summarize-table` / `polish-tone` / `fix-typos`），用户条目撞上这些 id 会被跳过
- `listBuiltinInlineEditPresets()`：按当前 locale 物化内置目录（label + prompt 均非空）
- `listEffectiveInlineEditPresets(userPresets)`：合成规则——内置在前，用户条目按设置顺序追加；过滤 label/prompt 为空的半成品行；跳过保留 id

## 依赖

- `../../core/types`（`InlineEditPresetPrompt` 类型，仅 type import）、`../../i18n`

## 维护约束

- 预设与形态无关：选区 / 光标 / 全文（R-A6）共用同一份目录，**不得**在此加形态过滤（需求 R-A2 第 5 条）
- 新增/修改内置预设必须同步 `zh.ts` 与 `en.ts` 两语的 label + prompt，并把 id 登记进 `INLINE_EDIT_BUILTIN_PRESET_IDS`；对应单测在 `InlineEditPresets.test.ts`
- 用户层持久化/归一化属于 `core.types`（`normalizeInlineEditPresetPrompts`）；设置页 CRUD 属于 `SettingsInlineEditSection`；本模块只负责目录与合成
