# SettingsBackendSection

> **源码**: `src/features/settings/SettingsBackendSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsBackendSection` 负责 `General > Backend Management` 设置面板。它只管理 Phase 0 的后端选择 UI，不启动或切换任何非 OpenCode runtime。

## 职责

- 渲染新会话默认 backend 的下拉选择，选项来自当前 enabled backend 列表
- 渲染五个已知 backend 的启用开关：`opencode`、`claude-code`、`codex`、`copilot`、`pi`
- 保证 OpenCode 在 Phase 0 中始终启用且不可关闭
- 禁止关闭最后一个已启用 backend，并在当前 active backend 被禁用时回退到 `opencode`

## 集成

- `SettingsTabbedRenderer`: 在 `general/backend` 二级标签下创建并挂载本 section
- `OpenCodianSettings.activeBackend`: 保存新会话默认 backend
- `OpenCodianSettings.enabledBackends`: 保存设置页可见 backend 范围，供设置 tab 过滤使用

## 维护约束

- 展示文案必须通过 `t()` 和 locale key 获取，避免硬编码 UI 字符串
- 非 OpenCode backend 在 Phase 0 仅显示 Coming Soon 描述，不应接入 runtime 行为
