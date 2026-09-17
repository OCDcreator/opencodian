# inline-edit.css

> **源码**: `src/style/features/inline-edit.css`
> **状态**: [REVIEW]

## 概述

inline edit 全部 UI 的样式。设计语言：Cursor cmd-K 指令条骨架（输入优先、配置沉底）+ Linear/Vercel 式克制精确（ghost token chip、发丝分隔线、每个表面只有一个实心强调动作）。布局为：澄清/错误块置顶 → 输入行（sparkles 引导图标 + 无边框输入框 + 实心提交/幽灵关闭）→ 页脚（提供商图标模型 chip + 文字标签努力 chip）。颜色全部映射到 Obsidian 主题变量，明暗主题与自定义主题自动适配；悬浮面保持半透明 + 毛玻璃，正文文字微微透出。DOM 契约见 `src/features/inline-edit/InlineEditInputOverlay.ts` 与 `InlineEditWidgets.ts`。

## 职责

- `.opencodian-inline-edit`：作用域令牌（`--ocie-radius` / `--ocie-hairline` / `--ocie-divider` / `--ocie-surface` / `--ocie-menu-surface` / `--ocie-shadow` / `--ocie-diff-*`）。**overlay、affordance、preview 根元素都必须挂这个基类**，否则圆角/阴影/表面色全部失效（历史 bug：基类缺失导致直角 + 浅色阴影从未生效）
- `.opencodian-inline-edit-overlay`：悬浮指令条（12px 圆角卡片：94% 不透明背景 + `backdrop-filter`；含 pop-in 动画与 busy 态——busy 时输入禁用、引导图标 pulse）
- `.opencodian-inline-edit-reply` / `-error`（`-alert-icon` / `-alert-text`）：澄清回复与错误提示块（圆角淡色 tint + 前导语义图标；不用左侧色条）
- `.opencodian-inline-edit-inputrow` / `-inputlead` / `-field`：输入行（sparkles 引导图标 + 无边框输入框 + accent 色 caret）
- `.opencodian-inline-edit-overlay-submit` / `-overlay-close`：实心 accent 提交按钮（busy 换 spinner）+ 幽灵关闭按钮
- `.opencodian-inline-edit-chipbar` / `-chip`（`-prefix` / `-value` / `-chevron`）：页脚 ghost token chip——模型 chip 前缀为提供商品牌图标（`img`，同主输入窗口 `ProviderIconService` 管线），努力 chip 为 lucide 图标 + 可见文字标签；完整标签在 `title` tooltip
- `.opencodian-inline-edit-menu`（`-item` / `-item-check` / `-item-icon` / `-item-glyph` / `-item-label` / `-menu-separator`）：下拉菜单；每行统一 13px 图标槽（品牌图标 / signal 信号格 / 清除行字形）保证 label 对齐；含自定义滚动条
- `.opencodian-inline-edit-preview` / `-body` / `-fallback`：diff 预览卡片；body 继承编辑器字体字号（展示正文内容）
- `.opencodian-inline-edit-insert` / `-delete`：词级 diff 配色（绿插入 / 红删除+删除线，底 + inset 发丝环；相邻 delete↔insert 边界用相邻选择器加 6px 呼吸间隙；fallback 模式为块级展示）
- `.opencodian-inline-edit-actions` / `-actions-label` / `-action.is-accept` / `.is-reject`：预览页脚——左侧 sparkles 身份标签，右侧幽灵"拒绝" + 实心"接受"
- `.opencodian-inline-edit-affordance`：选区悬浮小按钮（sparkles 图标，毛玻璃 + pop-in + hover 放大）
- `.theme-dark .opencodian-inline-edit*`：深色主题覆盖——表面混白提亮 + 卡片顶部 inset 高光 + 阴影大幅加浓（浅色阴影在深色页面上不可见）、diff 色块 alpha 提升、reply 块改用前景色 tint

## 依赖

- Obsidian 主题变量（`--background-*`、`--text-*`、`--interactive-*`、`--font-ui-*`）
- `color-mix()`（Chromium 内核原生支持）

## 维护约束

- 该样式渲染在笔记编辑器内部，优先使用 Obsidian 主题变量；唯一的硬编码色是 diff 红绿底（跨主题语义色，带透明度）与黑/白 alpha 明暗处理
- 改类名需同步 `InlineEditInputOverlay.ts` / `InlineEditWidgets.ts` / `InlineEditSelectionAffordance.ts` 中的常量、`.obsidian-debug/style-repro/index.html` 的 mock DOM、`.obsidian-debug/evals/` 的 E2E 选择器（预览按钮按 `.is-accept`/`.is-reject` 类名选，不是下标）
- 深色专属调整必须走 `.theme-dark` 覆盖块，不要在基础规则里塞主题分支
- 通过 `src/style/index.css` 的 `@import` 参与 `npm run build:css` 合并；新增文件必须同时登记到 index
- 视觉回归用 `.obsidian-debug/style-repro/`（puppeteer + 本地 Chrome 实拍四个明暗面板）；改 DOM 结构必须同步 mock，否则截图骗人
