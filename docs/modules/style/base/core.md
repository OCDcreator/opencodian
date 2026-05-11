# Core Styles

> **源码**: `src/style/base/core.css`
> **状态**: [FINAL]

## 职责

提供 OpenCodian 全局设计 token 与基础布局骨架，覆盖主题变量、玻璃态参数、消息区/输入区容器、标签页栏、滚动条、主题背景层和若干通用动画。`src/style` 下多数子模块都依赖这里定义的变量。

## 关键类名 / CSS 变量

- `:root`、`.theme-dark`、`.theme-light`：定义 `--opencodian-*` 与 `--lobehub-icon-filter*` 等主题变量；其中 `body[data-opencodian-provider-icon-mode]` 会在 `跟随系统 / 单色 / 彩色` 三种 provider 图标模式之间切换。
- `.opencodian-container`：聊天主容器，声明消息/输入区的尺寸变量（如 `--opencodian-messages-pad-*`、`--opencodian-composer-stack-height`）。
- `.opencodian-messages`、`.opencodian-turn*`：消息列表、分轮结构与 sticky header 行为。
- `.opencodian-tab-bar*`、`.opencodian-tab-bar-parent-breadcrumb*`、`.opencodian-tab-overflow-menu*`：多会话标签栏、子会话返回父 tab 面包屑与溢出菜单样式。
- `.opencodian-theme-background-*`：主题背景图层、遮罩、叠加高光。
- 关键变量组：`--opencodian-glass-*`、`--opencodian-composer-*`、`--opencodian-status-*`、`--opencodian-shadow-*`。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/ui/NavigationSidebar.ts`
- `src/features/chat/ui/ContextRing.ts`
- `src/features/chat/ui/QuestionDock.ts`
- `src/features/chat/ui/SessionTodoDock.ts`
- `src/features/settings/OpenCodianSettings.ts`

## 修改注意点

- 此文件是全局变量源，改 token 前要检查 `components/`、`features/`、`modals/` 中是否有连锁影响。
- 标签栏与 sticky header 依赖精确层级（`z-index`、`overflow`、`position`），不要单点改动后遗漏滚动场景验证。
- 子会话返回面包屑在横向和 `below-header-vertical` 布局下共用 `opencodian-tab-bar-parent-breadcrumb*` 类，调整尺寸时要避免挤压 tab 按钮和溢出菜单。
- 如仅调整样式拼接产物，执行 `npm run build:css`；发版前以 `npm run build` 为准。
- provider 图标颜色模式是全局变量开关，改这里时要同时检查聊天区、设置页、模型工作区和 provider icon modal 的预览表现。
