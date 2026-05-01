# ChatSurfaceAppearanceCoordinator

> **源码**: `src/features/chat/services/ChatSurfaceAppearanceCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatSurfaceAppearanceCoordinator` 负责聊天界面外观的完整生命周期管理。它将原来由 `OpenCodianView` 直接拥有的外观相关逻辑提取到一个专门的协调器中，包括：

- 主题预设类/CSS 变量切换
- 聊天外观 CSS 变量注入
- 主题背景图异步加载
- 自定义 CSS `<style>` 元素生命周期
- 滚动模式类切换
- 粘性遮罩颜色同步（含 rAF/timeout 调度）

## 导入关系

```text
上游:
- ../../../core/theme (getThemePresetDefinition, THEME_PRESET_CSS_VARIABLE_NAMES, THEME_STYLE_CONTAINER_CLASSES)
- ../../../core/types (ChatAppearanceSettings)
- ../../../core/types/settings (ThemePresetId)
- ../chatAppearance (getChatAppearanceCssVariables, buildChatAppearanceCustomCss)
- ./ChildSessionGraphCoordinator (SESSION_TREE_BASE_CSS)

下游:
- src/features/chat/OpenCodianView.ts (消费者)
```

## 核心类型

- `ChatSurfaceAppearanceCoordinatorHost`: Host 接口，定义协调器从视图获取的依赖：
  - `getChatContainerEl()`: 获取聊天容器 DOM 元素
  - `getThemeBackgroundImageEl()`: 获取主题背景图 DOM 元素
  - `getMessagesContainerEl()`: 获取消息容器 DOM 元素
  - `getChatAppearanceSettings()`: 获取聊天外观设置
  - `getActiveThemePresetId()`: 获取当前主题预设 ID
  - `getChatScrollMode()`: 获取滚动模式
  - `resolveChatThemeBackgroundDataUrl()`: 异步解析主题背景图 Data URL
  - `applyConversationVisualState()`: 应用对话视觉状态
  - `syncInputPanelAppearance()`: 同步输入面板外观

## 核心方法

| 方法 | 说明 |
|------|------|
| `syncAppearanceState()` | 同步完整外观状态：主题预设、CSS 变量、背景图、自定义 CSS、委托子系统 |
| `syncScrollMode()` | 同步滚动模式并触发表面颜色同步 |
| `applyScrollModeToMessagesEl(messagesEl)` | 对指定元素应用滚动模式类 |
| `syncChatSurfaceColor()` | 立即同步聊天表面颜色（向上遍历 DOM 计算背景色） |
| `scheduleSurfaceColorSync()` | 通过双 rAF + 80ms timeout 调度表面颜色同步 |
| `clearSurfaceSyncTimers()` | 清除 pending 的 rAF 和 timeout |
| `destroy()` | 清理：清除定时器、移除 style 元素 |

## 数据流

```
OpenCodianView.applyChatAppearanceSettings()
  → ChatSurfaceAppearanceCoordinator.syncAppearanceState()
    → 主题预设类/CSS 变量
    → 聊天外观 CSS 变量 (chatAppearance.ts)
    → 对话视觉状态 (ConversationSessionSettingsCoordinator)
    → 主题背景图异步加载
    → 自定义 CSS style 元素生命周期
    → 输入面板外观同步 (InputPanelAppearanceCoordinator)
```

## 注意事项

- `SESSION_TREE_BASE_CSS` 始终包含在自定义 CSS 中，因此 style 元素通常不会为空
- 主题背景图加载是异步的，使用 `themeBackgroundRequestId` 进行请求去重
- 表面颜色同步使用双 rAF 模式确保布局已稳定，再辅以 timeout 兜底
- 该协调器不直接操作 `tabMessagesPaneCoordinator` 的滚动模式；`OpenCodianView.applyChatScrollMode()` 先检查 pane coordinator，再回退到本协调器
