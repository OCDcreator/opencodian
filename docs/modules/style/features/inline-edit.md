# inline-edit.css

> **源码**: `src/style/features/inline-edit.css`
> **状态**: [REVIEW]

## 概述

inline edit 全部 UI 的样式。设计语言：Cursor cmd-K 指令条骨架（输入优先、配置沉底）+ Linear/Vercel 式克制精确（ghost token chip、发丝分隔线、每个表面只有一个实心强调动作），品牌标记统一用插件自己的 app icon。布局为：澄清/错误块置顶 → 输入行（字段框体：[品牌标记 + 无边框输入框] + 实心提交/幽灵关闭）→ 页脚（提供商图标模型 chip + 文字标签努力 chip）。颜色全部映射到 Obsidian 主题变量，明暗主题与自定义主题自动适配；悬浮面保持半透明 + 毛玻璃，正文文字微微透出。DOM 契约见 `src/features/inline-edit/InlineEditInputOverlay.ts` 与 `InlineEditWidgets.ts`。

## 职责

- `.opencodian-inline-edit`：作用域令牌（`--ocie-radius` / `--ocie-hairline` / `--ocie-divider` / `--ocie-surface` / `--ocie-menu-surface` / `--ocie-field-surface(-focus)` / `--ocie-field-ring` / `--ocie-shadow` / `--ocie-diff-*`）。**overlay、affordance、preview 根元素都必须挂这个基类**，否则圆角/阴影/表面色全部失效（历史 bug：基类缺失导致直角 + 浅色阴影从未生效）
- `.opencodian-inline-edit-overlay`：悬浮指令条（12px 圆角卡片：94% 不透明背景 + `backdrop-filter`；含 pop-in 动画与 busy 态——busy 时输入禁用、引导图标 pulse）
- `.opencodian-inline-edit-reply` / `-error`（`-alert-icon` / `-alert-text`）：澄清回复与错误提示块（圆角淡色 tint + 前导语义图标；不用左侧色条）
- `.opencodian-inline-edit-inputrow` / `-inputfield` / `-inputlead` / `-field`：输入行——品牌标记作条子头像在**字段框外**、钉在首行（`height: 18px; margin-top: 7px`，多行增高时不会跟着跑）；`inputfield` 是**字段框体**（填充底 + 发丝内环 + `7px 10px` 内边距 + 聚焦态强调色内环），`field` 是框内的 `textarea`（`resize: none`、默认一行、由 overlay 增高到 100px 上限后内部滚动，CSS `max-height` 同值兜底），其全部盒属性（border/background/box-shadow/padding/min-height/outline/font-size）都用 `!important` 钉死；提交/关闭按钮 `align-self: center` 与字段框体同心（行自身是 flex-start，好让品牌标记钉在首行；按钮贴底在单行条子上会读成"下垂 3px"）

  **为什么字段框体归我们所有**：宿主主题与用户 CSS 片段会按自己的规则给裸表单控件加边框和内边距，实测出现过"有边框、零内边距、placeholder 贴着框线"的线上表现。这个浮层必须在任意主题下长相一致，所以框体由 `.opencodian-inline-edit-inputfield` 承担，输入控件本身被压成透明无边框；`.obsidian-debug/style-repro` 的 mock 现在也模拟宿主表单样式，并由 `verify-dark.cjs` 断言"控件无边框/无内边距、框体有填充与内边距、多行时框体确实增高、品牌标记在框外"——不要为了"看起来更简单"把这些 `!important` 删掉
- `.opencodian-inline-edit-overlay-submit` / `-overlay-close`：实心 accent 提交按钮（busy 换 spinner）+ 幽灵关闭按钮
- `.opencodian-inline-edit-chipbar`（两行：`-context-row` 已附加笔记 chip，空时由 overlay 隐藏；`-config-row` 配置行）/ `-chip`（`-prefix` / `-value` / `-chevron`）/ `-context-chip`（含 `-remove`）×）：页脚 ghost token chip——模型 chip 前缀为提供商品牌图标（`img`，同主输入窗口 `ProviderIconService` 管线），努力 chip 为 lucide 图标 + 可见文字标签；完整标签在 `title` tooltip
- `.opencodian-inline-edit-preset-menu` / `.opencodian-inline-edit-menu-item-preset`：`#` 预设菜单变体（R-A2）——复用下拉菜单容器与行骨架，`width: 100%` 与上下文选择器对齐（左边框贴卡片边框），行高 30px；prompt 正文在行 `title` tooltip 而非副标题行
- `.opencodian-inline-edit-menu`（`-item` / `-item-check` / `-item-icon` / `-item-glyph` / `-item-label` / `-menu-separator`）：下拉菜单；每行统一 13px 图标槽（品牌图标 / signal 信号格 / 清除行字形）保证 label 对齐；含自定义滚动条
- `.opencodian-inline-edit-picker`（`-search` / `-list` / `-folder` / `-empty` / `-hint`）：附加上下文选择器——菜单的变体，`width: 100%` + overlay 侧 `left: 0`，使它的左右边框与卡片边框对齐（内缩会显得错位，更宽则探出卡片右缘）；搜索框置顶不随列表滚动，且与字段框体同样用 `!important` 钉死盒属性
- `.opencodian-inline-edit-preview` / `-body` / `-fallback`：diff 预览卡片；body 继承编辑器字体字号（展示正文内容）
- `.opencodian-inline-edit-insert` / `-delete`：词级 diff 配色（绿插入 / 红删除+删除线，底 + inset 发丝环；相邻 delete↔insert 边界用相邻选择器加 6px 呼吸间隙；fallback 模式为块级展示）
- `.opencodian-inline-edit-actions` / `-actions-label` / `-action.is-accept` / `.is-reject`：预览页脚——左侧品牌标记身份标签，右侧幽灵"拒绝" + 实心"接受"
- `.opencodian-inline-edit-preview.is-busy`（R-A3）：流式中帧的虚线 accent 外框 + `-busy-label`（转圈图标 + `inlineEdit.preview.generating` 文案），配合按钮 disabled 表明"生成中、非最终结果"；reduced-motion 下转圈减速
- `.opencodian-inline-edit-image-row` / `-image-chip`（`-thumb` 22px data-URL 缩略图 / `-remove`）与 `.opencodian-inline-edit-overlay.is-image-drag-over`（R-A4）：图片附件 chip 行（插在配置行之前、空时隐藏）与拖拽悬停高亮
- `.opencodian-inline-edit-affordance`：选区悬浮小按钮（品牌标记图标，毛玻璃 + pop-in + hover 放大）
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

## R-C2 扩展

2026-09-18 新增生图 chip 样式：`.opencodian-inline-edit-chip-imagegen`（布局）与 `.opencodian-inline-edit-chip-imagegen-active`（accent 高亮）。

> 2026-09-18 (R-C3)：新增 `.cm-inline-completion-ghost`——与编辑器同字号的弱化斜体色（`color-mix(text-muted 72%, text-normal)`，≥4.5:1），`white-space: pre-wrap`、`pointer-events: none`，刻意**无动画**（不移动读者视线，reduced-motion 由构造满足）；光标跳过由 CM6 `atomicRanges` 承担，不依赖 CSS。
