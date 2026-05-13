# SettingsToolSection

> **源码**: `src/features/settings/SettingsToolSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsToolSection` 是设置页工具权限管理的 section owner。它根据模式渲染内置工具或自定义工具列表，并为每个工具提供 allow / ask / deny 下拉框，最终写入当前项目 OpenCode config 的 `permission` 设置。

## 关键导出

- `SettingsToolSection`: 渲染 builtin/custom 工具权限 UI 并保存权限变更的 class。

## 核心逻辑

### 内置工具

- `renderBuiltinTools()` 按文件、搜索、执行、网络、智能、元工具和计划工具分组渲染，每组使用 `opencodian-tool-group-panel` 和说明文案呈现。
- 每个工具先通过 `isBuiltinToolName()` 校验，再用 `getToolIdentity()` 获取标准名称和显示名称。
- 当前权限来自具体 tool id，缺省时回退到通配符 `*`，再回退到 `allow`。
- 每个权限行外层带 `opencodian-tool-permission-row` 和 `data-tool-permission`，用于 CSS 区分 allow / ask / deny 状态，不改变权限保存语义。

### 自定义工具

- `renderCustomTools()` 从 `openCodeCatalogStateStore` 读取 registry tool ids。
- `classifyToolIds()` 将工具分成 builtin/custom，只渲染 custom 列表。
- 自定义工具按名称排序，并通过 registry context 解析显示名。自定义工具列表也复用 group panel 结构，空状态使用共享的 `opencodian-settings-inline-empty` 样式。

### 权限保存

- `renderToolRow()` 为每个工具创建 Obsidian `Setting` 和权限下拉框。
- `setToolPermission()` 调用 `opencodeConfigManager.setToolPermission()` 写入项目配置。
- 写入后调用 `plugin.saveSettings()`，并关闭 config sync、model reload 和 UI apply，避免权限编辑触发无关刷新。

## 依赖

- `obsidian`: 提供 `Setting` UI 组件。
- `src/main`: 提供 `OpenCodianPlugin` 类型和 plugin runtime seams。
- `src/i18n`: 提供工具设置文案翻译。
- `src/shared/toolIdentity.ts`: 提供内置工具识别和显示名解析。

## 注意事项

- 该 section 只编辑 OpenCode `permission` 配置，不直接执行工具权限判断。
- 没有 catalog store 或没有 custom tools 时会渲染空状态文案。
- `getCatalogStore()` 通过可选 runtime seam 读取 catalog store，避免强绑定插件公开类型。
