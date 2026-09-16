# inline-edit.css

> **源码**: `src/style/features/inline-edit.css`
> **状态**: [REVIEW]

## 概述

inline edit 全部 UI 的样式，设计语言移植自 shadcn/ui（new-york 中性主题）：popover 卡片 = 10px 圆角 + 1px 发丝边框 + 分层柔和阴影 + fade/zoom 入场；菜单 = 4px 内边距卡片 + 30px 列表项 + 16px check 槽位；kbd = 弱化键帽 chip；预览卡片底部为 dialog-footer 式主次按钮（实心"接受"居右）。颜色全部映射到 Obsidian 主题变量，明暗主题与自定义主题自动适配。DOM 契约见 `src/features/inline-edit/InlineEditInputOverlay.ts` 与 `InlineEditWidgets.ts`。

## 职责

- `.opencodian-inline-edit`：作用域令牌（`--ocie-radius` / `--ocie-hairline` / `--ocie-shadow` 等）
- `.opencodian-inline-edit-overlay`：悬浮指令条（毛玻璃卡片：半透明背景 + `backdrop-filter`；含 pop-in 动画与 busy 态）
- `.opencodian-inline-edit-chipbar` / `-chip`（`-prefix` / `-value` / `-chevron`）/ `-kbd-hints`：顶行 = 模型/思考 chip 左对齐 + ⏎/Esc 键帽提示右对齐，底部发丝分隔线
- `.opencodian-inline-edit-inputrow` / `-field`：底行 = 无边框输入框 + 提交（强调色）/ 关闭（幽灵）图标按钮
- `.opencodian-inline-edit-reply` / `-error`：澄清回复与错误提示条（左侧 2px 强调/错误色竖线的 alert 风格）
- `.opencodian-inline-edit-menu`（`-item` / `-item-check` / `-item-label` / `-menu-separator`）：下拉菜单，选中项 check 槽位 + 强调色
- `.opencodian-inline-edit-preview` / `-body` / `-fallback`：diff 预览卡片与超限降级视图
- `.opencodian-inline-edit-insert` / `-delete`：词级 diff 配色（绿插入 / 红删除+删除线；相邻 delete↔insert 边界用相邻选择器加 6px 呼吸间隙）
- `.opencodian-inline-edit-actions` / `-action.is-accept` / `.is-reject`：实心接受 + 描边拒绝
- `.opencodian-inline-edit-affordance`：选区悬浮小按钮（毛玻璃 + hover 缩放）
- `.theme-dark .opencodian-inline-edit-*`：深色主题覆盖——阴影加浓（浅色阴影在深色页面上不可见）、卡片背景混白提亮、边框不透明化

## 依赖

- Obsidian 主题变量（`--background-*`、`--text-*`、`--interactive-*`、`--font-ui-*`）
- `color-mix()`（Chromium 内核原生支持）

## 维护约束

- 该样式渲染在笔记编辑器内部，优先使用 Obsidian 主题变量；唯一的硬编码色是 diff 红绿底（跨主题语义色，带透明度）
- 改类名需同步 `InlineEditInputOverlay.ts` / `InlineEditWidgets.ts` 中的常量
- 深色专属调整必须走 `.theme-dark` 覆盖块，不要在基础规则里塞主题分支
- 通过 `src/style/index.css` 的 `@import` 参与 `npm run build:css` 合并；新增文件必须同时登记到 index
- 视觉回归用 `.obsidian-debug/style-repro/`（puppeteer + 本地 Chrome 实拍四个明暗面板）
