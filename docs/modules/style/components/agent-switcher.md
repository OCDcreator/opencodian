# Agent Switcher Styles

> **源码**: `src/style/components/agent-switcher.css`
> **状态**: [REVIEW]

## 职责

定义 tabbed settings 中 agent switcher 的悬浮图标组和顶部 chips 样式。悬浮图标组使用绝对定位，不占用设置页布局空间；顶部 chips 插入标题与一级 tab bar 之间。

## 关键类名

- 容器与 hover 区：`.opencodian-settings-tabbed`、`.opencodian-agent-switcher-hover-zone`、`.opencodian-agent-switcher-floating`
- 图标按钮：`.opencodian-agent-switcher-icon`、`.entering`、`.opencodian-agent-switcher-selected`、`.opencodian-agent-switcher-clicked`
- 顶部 chips：`.opencodian-agent-chips`、`.opencodian-agent-chip`、`.opencodian-agent-chip-selected`

## 关联 TS 组件

- `src/features/settings/AgentSwitcherFloatingIcons.ts`
- `src/features/settings/AgentSwitcherChips.ts`
- `src/features/settings/SettingsTabbedRenderer.ts`

## 修改注意点

- 左侧 hover zone 保持 80px 宽，用于触发隐藏图标组显现；不要让 floating group 参与普通文档流。
- entry/click 动画由 TS 临时添加 class 触发，idle/hover/selected 状态由 CSS 长期维护。
- 修改后执行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。
