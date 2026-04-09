# 样式目录 (Style)

> **源码**: `src/style/`
> **状态**: [FINAL]

## 概述

`src/style/` 目录包含了项目的全局 CSS 和组件级 CSS。为了解决单文件 `styles.css` 过大带来的维护痛点，我们对 CSS 进行了工程化拆分。
所有的模块化 CSS 文件都在开发期间各自独立维护，最终通过构建脚本 `scripts/build-css.mjs` 合并为根目录的单一 `styles.css` 文件供 Obsidian 加载。

## 目录结构与职责

```text
src/style/
├── index.css                             # 统一的引入入口文件，只包含 @import 语句
├── base/
│   └── core.css                          # Obsidian 基础样式的覆写、全局 CSS 变量设定
├── features/                               # 核心业务界面的样式
│   ├── chat-user.css                     # 用户发送的聊天气泡及交互样式
│   └── chat-assistant.css                # 助手回复的气泡、控制栏样式
├── components/                             # 通用复用组件的样式
│   ├── model-selector.css                # 模型选择器样式
│   ├── permission-mode-selector.css      # 权限模式选择器样式
│   ├── history-dropdown.css              # 历史记录下拉菜单样式
│   ├── streaming-content.css             # 正在输出打字的流式区块样式
│   ├── inline-permission.css             # 内联的权限请求卡片样式
│   ├── config-status.css                 # 配置状态提示样式
│   ├── navigation-sidebar.css            # 侧边栏导航样式
│   └── effort-selector.css               # “努力程度”调节器样式
├── modals/                                 # 各种弹窗、设置项覆盖面板的样式
│   ├── provider-icon-cache.css           # 图标缓存管理与内置图标选择弹窗样式
│   ├── delete-confirm-dialog.css         # 删除确认弹窗样式
│   ├── permission-dialog.css             # 独立的权限确认弹窗样式
│   └── config-editor-modal.css           # 设置里的大型配置编辑弹窗样式
└── utils/                                  # 专用渲染工具和基础设施的样式
    └── markdown.css                      # 代码块、Markdown 渲染等专用样式
```

## 构建流程

### 合并逻辑

开发时我们只修改 `src/style/**/*.css`。构建通过运行 `node scripts/build-css.mjs` 实现；生产构建 `npm run build` 现在也会在打包前自动执行这一步。
脚本会读取 `src/style/index.css`，解析其中的 `@import` 语句，并将引用的各个 CSS 文件的内容按顺序拼接起来，输出到项目根目录的 `styles.css` 中。

### 顺序敏感性

CSS 依赖加载顺序以确保后加载的样式能正确覆盖前方的样式。当前 `src/style/index.css` 采用如下顺序：
1. `base/` (基础重置、变量)
2. `utils/` (排版和通用渲染)
3. `components/` (通用小组件)
4. `features/` (具体的页面或大模块)
5. `modals/` (最高层级的弹窗遮罩)

## 开发指南

- **添加新样式**: 当您开发新的视图或组件时，请不要在现有文件里无脑追加。新建一个独立的 `.css` 文件存放到合适的子目录（如 `src/style/components/new-button.css`），并在 `src/style/index.css` 中添加 `@import 'components/new-button.css';`。
- **命名规范**: 遵循已有的 `opencodian-` 前缀以防止与 Obsidian 或其他插件的 CSS 类冲突（例如 `.opencodian-icon-cache-modal`）。
- **同步构建**: 修改了 `src/style/` 下的任何代码后，开发期仍需执行 `node scripts/build-css.mjs` 或 `npm run build:css` 以刷新根目录的 `styles.css`；生产构建 `npm run build` 会自动完成这一步。

## 注意事项

- **切勿直接修改根目录的 `styles.css`**，任何在外部的直接修改将在下一次运行合并脚本时被覆盖并永久丢失！

## 待补充
- [ ] 考虑后续集成 PostCSS / CSS Modules / Sass 来提供 CSS 的嵌套语法支持和更高级的编译检查。
