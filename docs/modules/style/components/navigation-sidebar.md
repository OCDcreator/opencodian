# Navigation Sidebar Styles

> **源码**: `src/style/components/navigation-sidebar.css`
> **状态**: [FINAL]

## 职责

定义消息区侧边导航条（顶部/上一个/下一个/底部）的悬浮显示、弱显隐与按钮交互样式。

## 关键类名 / CSS 变量

- `.opencodian-nav-sidebar-host`：侧栏挂载层（绝对定位覆盖）。
- `.opencodian-nav-sidebar`、`.opencodian-nav-sidebar.visible`：显示与透明度行为。
- `.opencodian-nav-btn`：统一按钮基样式。
- `.opencodian-nav-btn:hover|:active|:focus-visible`：缩放、焦点轮廓与交互反馈。

## 关联 TS 组件

- `src/features/chat/ui/NavigationSidebar.ts`

## 修改注意点

- 侧栏默认低透明度（`0.08`）是刻意设计，避免遮挡聊天内容；改动需评估阅读干扰。
- `pointer-events` 切换关系到是否可点击，不要只改透明度。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
