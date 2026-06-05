# SlashCommandCatalogRenderer

> **源码**: `src/features/settings/SlashCommandCatalogRenderer.ts`
> **状态**: [REVIEW]

## 概述

`SlashCommandCatalogRenderer` 是 `SettingsCommandsSection` 的 companion owner，负责将合并后的 slash command 目录渲染为卡片式网格 UI。它封装了搜索、筛选、卡片渲染、多选批量操作等 catalog 可视化逻辑，与 `SettingsCommandsSection` 的 catalog 数据加载和 visibility 写回职责分离。

## 核心逻辑

### 卡片式目录渲染

`render()` 方法接收合并后的命令列表、显示 ID 回调、可见性更新回调和刷新回调，依次渲染：

1. **控件栏** — 搜索框 + 筛选标签
2. **批量操作栏** — 仅在有多选项目时显示
3. **卡片网格** — 带滚动容器的 `auto-fill` 网格

### 搜索

使用 `enhanceSearchInput()` 提供搜索历史和模糊匹配。`fuzzyMatch()` 对 command ID、description 和 display ID 做子序列匹配。

### 筛选

5 个筛选标签：`All`、`Skills`、`Commands`、`Enabled`、`Disabled`。`Skills` 按 `source === 'skill'` 过滤；`Commands` 按 `source === 'command' || source === 'md-command'` 过滤（Claude runtime command 仍会出现在 All/Enabled/Disabled 中并带独立来源 chip）；`Enabled`/`Disabled` 按 `hidden` 过滤。

### 卡片

每个命令卡片包含：多选复选框、`/command-name`、来源芯片（Skill / Command / Project / MD / Claude）、内置芯片（Built-in，仅白名单命令显示）、状态芯片（Subtask / Unavailable）、可折叠描述、可见性切换。`getSourceChipLabel()` 现在把 `source: 'claude-runtime'` 显示为 `settings.commands.catalog.chip.claudeRuntime`。点击卡片或描述文本切换展开状态。可见性切换的 `label` 包装使用 `data-settings-tooltip` 属性（`SettingsTooltipController` body-level overlay），替代了原来的 `toggleWrap.setAttribute('title', ...)`。

### 多选批量操作

`selectedIds` 跟踪多选状态。批量操作栏显示选中计数 + 启用/禁用按钮，通过回调让上层执行 visibility 写回。

## 关键方法

| 方法 | 说明 |
|------|------|
| `render()` | 主入口，渲染完整的搜索 + 筛选 + 批量操作 + 卡片网格 |
| `renderSearch()` | 渲染带搜索历史的搜索框 |
| `renderPills()` | 渲染筛选标签按钮 |
| `renderBatchBar()` | 渲染多选批量操作栏 |
| `renderCard()` | 渲染单个命令卡片 |
| `applyFilters()` | 根据筛选标签和搜索词过滤命令列表 |

## 与其他模块的交互

- `SettingsCommandsSection`: 创建并调用本 renderer，提供命令数据、display ID 回调和 visibility 写回回调
- `searchInputEnhancer.ts`: 提供搜索历史增强功能
- `SettingsTooltipController`: 提供可见性切换包装的 body-level tooltip overlay
- `core/config/slashCommandCatalog.ts`: 提供 `SlashCommandCatalogEntry` 类型和 `SlashCommandCatalogSource` 类型
- `i18n/locales/*`: 提供搜索占位符、筛选标签、芯片标签、批量操作和无匹配空态文案

## 注意事项

- 本 renderer 不持有数据加载或 visibility 持久化逻辑，所有状态变更通过回调委托给上层
- 搜索、筛选和多选状态在 renderer 实例上持久化，refresh 不会重置这些 UI 状态
- CSS 样式前缀统一为 `opencodian-cmd-catalog-*`，定义在 `config-editor-modal.css`。批量操作条只在存在选中项时进入 DOM，避免空条占位；卡片网格桌面态固定两列，窄屏退成单列；卡片左侧批量选择保持方形 checkbox，右侧可见性控制复用 Obsidian `checkbox-container` 开关样式并保留 `role="switch"`。
