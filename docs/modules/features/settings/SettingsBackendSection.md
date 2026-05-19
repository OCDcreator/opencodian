# SettingsBackendSection

> **源码**: `src/features/settings/SettingsBackendSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsBackendSection` 负责 `General > Agent Management` 设置面板。它管理当前已实现 agent backend 的启用范围与新会话默认 agent，并在 OpenCode backend 开关变化时以 best-effort 方式同步 runtime 生命周期。

## 职责

- 渲染新会话默认 backend 的下拉选择，选项来自当前 enabled backend 列表
- 通过 `IMPLEMENTED_AGENT_BACKENDS` 过滤已知 backend，目前只渲染已实现的 `opencode` 开关
- 导出 `BACKEND_OPTIONS`，让 agent switcher 复用同一组已实现 backend id 与 locale key
- 允许所有 backend 被禁用，并在没有 enabled backend 时显示空状态提示
- 在当前 active backend 被禁用时回退到 enabled 列表中的第一个 backend
- 更新设置时同步 `AgentServiceRegistry` 的 enabled/active 状态，并在 OpenCode 启用/禁用时尝试 start/stop adapter 或 legacy `openCodeService`

## 公共导出

- `BACKEND_OPTIONS`: 从内部已知 backend 列表按 `IMPLEMENTED_AGENT_BACKENDS` 过滤后的设置页选项，包含 backend id、名称 locale key 和描述 locale key。
- `SettingsBackendSection`: 设置 section class，构造参数包含 `plugin` 与 `requestDisplayRefresh()`；调用 `attach()` 挂载默认 backend 下拉与 enabled backend 开关。

## 集成

- `SettingsTabbedRenderer`: 在 `general/backend` 二级标签下创建并挂载本 section
- `OpenCodianSettings.activeBackend`: 保存新会话默认 backend
- `OpenCodianSettings.enabledBackends`: 保存启用 backend 范围，并在读取/渲染时过滤到已实现 backend
- `AgentServiceRegistry`: 同步 active backend、enabled backend 状态，并优先通过 `get('opencode')` 管理 OpenCode adapter 生命周期
- `OpenCodeService`: 当 registry adapter 不存在时作为 OpenCode start/stop fallback

## 维护约束

- 展示文案必须通过 `t()` 和 locale key 获取，避免硬编码 UI 字符串
- 非 OpenCode backend 只有加入 `IMPLEMENTED_AGENT_BACKENDS` 后才应出现在本 section
- OpenCode start/stop 是 best-effort：失败不应阻止设置保存或 UI 刷新
