# EffortSelector

> **源码**: `src/features/chat/ui/EffortSelector.ts`
> **状态**: [REVIEW]

## 概述

`EffortSelector.ts` 是 composer toolbar 里的 thinking / effort variant dropdown。它不自行判断 backend 或模型类型，而是从 `EffortSelectorCallbacks` 读取当前模型、可选 variants、当前 variant，以及是否允许“默认/关闭”选项。

OpenCode 模式下，variants 来自当前 provider model catalog 的 `models[model].variants`，未选择时显示 `chat.effort.disabled`。Claude Code 模式下，`OpenCodianView` 提供固定的官方 effort variants：`low`、`medium`、`high`、`xhigh`、`max`，并禁用默认/关闭选项，因为 Claude Code effort 是 SDK option hint，不是 OpenCode-style variant off switch。

## 职责

- 渲染 compact effort label、当前值和 dropdown options
- 点击当前值时打开/关闭菜单，点击外部或按 Escape 关闭菜单
- 以 reverse order 展示 variants，让较高 effort 靠上
- 在当前模型不存在或 variants 为空时隐藏自身，避免留下空 toolbar 控件
- 通过 `allowDefaultOption()` 和 `getDefaultOptionLabel()` 支持 backend-specific 默认项语义

## 维护约束

- 该组件只管理 DOM 与选择事件，不保存设置，也不直接读取 backend capability。
- OpenCode / Claude Code 的 variant 来源与保存策略由 `OpenCodianView` host seam 决定。
- 新增 backend effort 语义时，优先扩展 callbacks，而不是在组件中硬编码 backend kind。
