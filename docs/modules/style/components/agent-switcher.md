# Agent Switcher Styles

> **源码**: `src/style/components/agent-switcher.css`
> **状态**: [REVIEW]

## 职责

定义 tabbed settings 中 agent switcher 的悬浮图标组和顶部 chips 样式。悬浮图标组使用绝对定位，不占用设置页布局空间；顶部 chips 插入标题与一级 tab bar 之间。

## 关键类名

- 容器与 hover 区：`.opencodian-settings-tabbed`、`.opencodian-agent-switcher-hover-zone`、`.opencodian-agent-switcher-floating`
- 图标按钮：`.opencodian-agent-switcher-icon`、`.entering`、`.opencodian-agent-switcher-selected`、`.opencodian-agent-switcher-clicked`
- LobeHub 图标：`.opencodian-agent-switcher-icon--lobehub`、`.opencodian-agent-switcher-lobehub-icon`、`.opencodian-agent-switcher-lobehub-img--light`、`.opencodian-agent-switcher-lobehub-img--dark`
- 顶部 chips：`.opencodian-agent-chips`、`.opencodian-agent-chip`、`.opencodian-agent-chip-selected`

## 关联 TS 组件

- `src/features/settings/AgentSwitcherFloatingIcons.ts`
- `src/features/settings/AgentSwitcherChips.ts`
- `src/features/settings/SettingsTabbedRenderer.ts`

## 修改注意点

- 左侧 hover zone 不再作为整栏命中区；只有固定在 pane 左边缘的悬浮图标列本身 hover/focus 时才滑出，避免鼠标进入设置页左侧空白就弹出图标。
- 悬浮图标组使用 `position: fixed` 和 `--opencodian-agent-switcher-fixed-left` 对齐设置 pane 内部左边缘，默认只显示 4px 竖向把手，不向设置界面外侧溢出，也不跟随正文内容滚动。
- hover/focus 时图标组在设置界面内部展开为 40px dock；按钮为 32px，LobeHub 图标为 18px，避免覆盖正文并避免半露图标。
- LobeHub 图标按 Obsidian 的 `body.theme-dark` 切换 light/dark 静态资源；不要影响顶部 chips 或设置页一级 tab 图标。
- entry/click 动画由 TS 临时添加 class 触发，idle/hover/selected 状态由 CSS 长期维护。
- 修改后执行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。
