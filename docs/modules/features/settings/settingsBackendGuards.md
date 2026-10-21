# settingsBackendGuards

> **源码**: `src/features/settings/settingsBackendGuards.ts`
> **状态**: [REVIEW]

## 概述

`settingsBackendGuards.ts` 提供设置页 owner 共用的 active backend 解析 helper，避免 OpenCode-owned settings section 各自复制 `activeBackend` / `enabledBackends` fallback 逻辑。

## 关键导出

- `SettingsBackendStateLike`: active backend 判定所需的最小 settings shape。
- `resolveSettingsActiveBackend()`: 如果 `activeBackend` 仍在 `enabledBackends` 中就返回它，否则回退到第一个 enabled backend；缺少 settings 时返回 `opencode2`（OpenCode 1 退役后的默认后端，2026-10-21 起不再解析为 `opencode`）。
- `isOpenCodeSettingsBackendActive()`: 判断当前设置 surface 是否应允许 OpenCode-owned callback 执行。

## 使用场景

Server、MCP、Tools、Tool detail modal、Formatter/LSP 和 Security settings 都会在 stale callback 执行前调用该 helper。这样 tabbed settings 已经按 active backend 过滤 UI 的前提下，旧 DOM callback 或已打开 modal 也不会在用户切到 Claude Code 后继续写 OpenCode 配置或调用 OpenCode runtime。

## 注意事项

- 这里的 fallback 必须与 settings tab 可见性和相邻 owner 保持一致：`activeBackend` 无效时使用 `enabledBackends[0]`。
- 缺少 settings 的旧测试/mock 环境现在视为非 OpenCode 1 active；需要覆盖 legacy v1 路径的测试必须显式设置 `activeBackend: 'opencode'` + `enabledBackends: ['opencode']`。
- 该 helper 只判断设置页 callback 是否可以进入 OpenCode-owned seam；它不替代 `AgentServiceRegistry` 的 runtime routing。
