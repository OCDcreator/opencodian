# SettingsBackendSection

> **源码**: `src/features/settings/SettingsBackendSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsBackendSection` 负责 `General > Agent Management` 设置面板。它管理 Phase 0 的 agent backend 启用范围与新会话默认 agent，不启动或切换任何非 OpenCode runtime。

## 职责

- 渲染新会话默认 backend 的下拉选择，选项来自当前 enabled backend 列表
- 渲染五个已知 backend 的启用开关：`opencode`、`claude-code`、`codex`、`copilot`、`pi`
- 导出 `BACKEND_OPTIONS`，让 agent switcher 复用同一组 id 与 locale key
- 允许所有 backend 被禁用，并在没有 enabled backend 时显示空状态提示
- 在当前 active backend 被禁用时回退到 enabled 列表中的第一个 backend

## 集成

- `SettingsTabbedRenderer`: 在 `general/backend` 二级标签下创建并挂载本 section
- `OpenCodianSettings.activeBackend`: 保存新会话默认 backend
- `OpenCodianSettings.enabledBackends`: 保存设置页可见 backend 范围，供设置 tab 过滤使用

## 维护约束

- 展示文案必须通过 `t()` 和 locale key 获取，避免硬编码 UI 字符串
- 非 OpenCode backend 在 Phase 0 仅显示描述与切换入口，不应接入 runtime 行为
