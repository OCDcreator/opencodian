# SettingsUiSection

> **源码**: `src/features/settings/SettingsUiSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsUiSection` 是 settings/UI 分区的厚 owner。它从 `OpenCodianSettings.ts` 接管 UI section 的完整 lifecycle：max tabs、tab position、below-header layout、auto scroll、chat scroll mode 与 open-in-main-tab 的 setting 装配与保存。

这个 owner 的职责边界保持在“**UI section 装配 + setting writeback orchestration**”：

- 持有 UI section 的 heading、slider、dropdown 与 toggle 组装
- 统一写回 `maxTabs`、tab 布局、滚动模式与主标签页打开开关
- 保持默认值、保存时机与 settings key 不变

## 核心逻辑

### section lifecycle 收束

`attach()` 会在一个 owner 内完成 UI section 的全部挂载流程：

- 创建 UI section heading
- 注册 max tabs slider
- 注册 tab position / below-header layout / chat scroll mode dropdown
- 注册 auto scroll 与 open-in-main-tab toggle

这样 `OpenCodianSettings` 不再直接展开 UI section 的控件 wiring，只保留 owner 创建。

### setting writeback

UI owner 内的每个控件都继续沿用既有语义：

- 直接读当前 `plugin.settings`
- 在 `onChange` 中写回对应 settings 字段
- 每次变更后调用 `plugin.saveSettings()`

本轮不改变 tab bar layout、chat scroll mode、默认值或保存时机，只收束 owner 边界。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 构建并挂载整个 UI section |
| `dispose()` | 为 settings tab 重建/关闭提供对称 owner 接口；当前无额外清理状态 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用 owner，把 UI section lifecycle 从主设置类中收口出去
- `core/types/settings.ts`: 定义 `TabBarPosition`、`BelowHeaderTabBarLayout` 与 `ChatScrollMode` 类型和默认值

## 注意事项

- 不要改变 tab bar layout 语义、scroll mode 语义、默认值或保存时机。
- 如果后续继续推进 UI lane，优先在这个 owner 内扩展完整 UI section lifecycle，而不是回到 `OpenCodianSettings` 主类里追加 setting 闭包。
