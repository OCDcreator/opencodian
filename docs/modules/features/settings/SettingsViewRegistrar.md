# SettingsViewRegistrar

> **源码**: `src/features/settings/SettingsViewRegistrar.ts`
> **状态**: [REVIEW]

## 概述

`SettingsViewRegistrar.ts` 注册 OpenCodian 的编辑区设置视图，并提供面向 `main.ts` 的刷新广播函数。它把 view type 注册、命令注册、leaf 激活，以及对已打开 settings view 的模型 / server 状态刷新收口到一个小型 registrar，避免继续扩张 `main.ts`。

## 导入关系

```text
上游: core/types, i18n, main, OpenCodianSettingsView
下游: main.ts
```

## 核心类型 / 接口

```typescript
export function registerSettingsView(plugin: OpenCodianPlugin): void
export async function activateSettingsView(plugin: OpenCodianPlugin): Promise<void>
export function broadcastModelsLoadedToSettingsViews(plugin: OpenCodianPlugin): void
export function broadcastServerStatusToSettingsViews(plugin: OpenCodianPlugin): void
```

## 核心逻辑

### 注册 view 与命令

`registerSettingsView()` 使用 `VIEW_TYPE_OPENCODIAN_SETTINGS` 注册 `OpenCodianSettingsView`。同时它注册 `open-settings-in-editor-area` 命令，并通过 `checkCallback` 读取 `settingsInEditorArea`：开关关闭时命令不可用，开关打开后才会激活或创建 settings leaf。

### 激活编辑区 settings leaf

`activateSettingsView()` 先复用已有 `VIEW_TYPE_OPENCODIAN_SETTINGS` leaf；如果当前没有打开，则通过 `workspace.getLeaf('tab')` 创建新 tab 并设置 view state。最后调用 `workspace.revealLeaf()` 把 settings view 带到前台。

### 广播运行时刷新

`broadcastModelsLoadedToSettingsViews()` 和 `broadcastServerStatusToSettingsViews()` 遍历当前 workspace 中所有 settings view leaf，并只对真实的 `OpenCodianSettingsView` 实例调用刷新方法。这样多个编辑区 settings tab 可以同时跟随模型目录和 server 状态变化。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `registerSettingsView()` | 注册 editor-area settings view type 与打开命令 |
| `activateSettingsView()` | 复用或创建 settings view leaf，并 reveal 到前台 |
| `broadcastModelsLoadedToSettingsViews()` | 通知所有打开的 settings view 刷新模型相关 UI |
| `broadcastServerStatusToSettingsViews()` | 通知所有打开的 settings view 刷新 server 状态相关 UI |

## 数据流

```text
main.ts onload()
  -> registerSettingsView(plugin)
  -> Obsidian workspace registerView + command registry

用户执行命令
  -> activateSettingsView(plugin)
  -> getLeavesOfType() / getLeaf('tab')
  -> OpenCodianSettingsView

runtime 状态变化
  -> broadcast*ToSettingsViews(plugin)
  -> getSettingsViews(plugin)
  -> OpenCodianSettingsView refresh hook
```

## 与其他模块的交互

- `src/main.ts`: 在插件启动和 runtime 状态回调中调用本 registrar 的公开函数
- `OpenCodianSettingsView`: 实际承载 editor-area settings UI 与刷新 hook
- `core/types`: 提供 `VIEW_TYPE_OPENCODIAN_SETTINGS`，确保 view type 与其他视图注册保持集中管理

## 配置项

- `settingsInEditorArea`: 控制 `open-settings-in-editor-area` 命令是否可用

## 注意事项

- 命令可见性必须继续受 `settingsInEditorArea` 约束，避免用户关闭功能后仍能从命令面板打开隐藏入口。
- 广播函数应保持只遍历已打开 leaf，不主动创建 settings view；主动创建只属于用户命令路径。
- 若 view type 常量变更，需要同步 `core/types`、本 registrar、相关 locale 文案与模块文档。
