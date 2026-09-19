# InlineEditOverlayPrimitives

> **源码**: `src/features/inline-edit/InlineEditOverlayPrimitives.ts`
> **状态**: [REVIEW]

## 概述

悬浮指令条的**小而纯的辅助函数合集**：菜单项映射、努力级别字形、面板定位几何（单面板翻转 + R-A5 多面板碰撞消解 + 锚线连接件几何），以及定位/字段用的布局常量与元素填充助手。全部从 `InlineEditInputOverlay` 抽出（该文件有硬性的 max-lines 预算，注释不计行；本模块是同一预算规则下的抽取产物）。几何函数全部为数字入/数字出，元素助手只**填充、定位或测量**递入的元素——全部可在无编辑器环境下单测。

## 职责

- 布局常量：`INLINE_EDIT_PANEL_GAP`（锚线到面板底间隙 6px）/ `INLINE_EDIT_PANEL_INSET`（面板在编辑器 DOM 内的水平内边距 8px；也作视口钳制的纵向内缩）/ `INLINE_EDIT_FIELD_MAX_HEIGHT`（指令字段增高上限 100px，与 CSS `max-height` 同值兜底）/ `INLINE_EDIT_ANCHOR_LINK_INSET`（锚线连接件距面板左缘 12px，恰在 12px 圆角之外）
- `InlineEditOverlayMenuItem` / `choicesToMenuItems(choices, activeId)`：host 选项 → 下拉菜单项（`id === null` 是"清除覆盖"行；`activeId` 高亮）
- `effortMenuIcon(id)`：努力级别行的 lucide 字形（signal-low/medium/high 信号格，清除行 rotate-ccw）
- `resolvePanelTop(input)`：单面板相对锚线行的纵向放置（有单测）。默认放锚点下方；下方放不下且上方放得下时翻到上方；两边都放不下时保持下方并裁切（维持光标侧阅读顺序）
- `InlineEditPanelBand {top, bottom}`：兄弟面板占用的纵向区间（编辑器 DOM 坐标系）；面板足够宽，碰撞空间就是纵向带
- `resolvePanelTopAmongSiblings(input)`（R-A5，有单测）：多面板碰撞消解。输入 anchor-preferred `preferredTop` + 兄弟带列表 + `panelHeight`/`viewportHeight`，返回与所有兄弟保持 ≥ `INLINE_EDIT_PANEL_GAP` 净空的最终 top。语义：无兄弟或 preferred 处无冲突 → **原样返回**（单面板路径零扰动，回归关键）；否则把兄弟带换成"禁止 top 区间"（开区间）并**排序合并**（O(n log n)），从 preferred 向外扫：向下推过最低栈（保持今日"锚下"默认）、向上顶到最高栈，取第一个能装进视口（`0 … viewportHeight - inset`）的方向；两向都装不下 → 两个候选各自钳入视口，取兄弟覆盖面积更小者（平局偏向向下）。确定性纯函数，不改入参
- `InlineEditAnchorLinkGeometry` / `anchorLinkGeometry(input)`（R-A5，有单测）：位移面板的锚线连接件几何——`displaced=false` 或面板仍与自身锚带重叠（钳制态）→ `null`（不渲染）；否则返回面板相对 `left`（= `INLINE_EDIT_ANCHOR_LINK_INSET`）、发丝线 `length` 与方向 `anchorBelow`
- `applyAnchorLink(link, geometry)`：把连接件几何写到元素上（display/left/`--ocie-anchor-link-length`/`is-anchor-below` 类）；`null` geometry → `display: none`
- `placeInlineEditPanel(input)`：单次完整放置流水线——水平钳制 → `resolvePanelTop` → `resolvePanelTopAmongSiblings` → 写 `panel.style.left/top` → `applyAnchorLink`，返回 `{left, top}` 供 overlay 记 `lastLeft/lastTop`。调用方必须已在 rAF 内（overlay 的测量纪律）；本模块内**所有**放置样式写入集中于此
- `syncInstructionFieldHeight(field)`：指令字段随内容增高，上限 `INLINE_EDIT_FIELD_MAX_HEIGHT`，超出改内部滚动（自 overlay 抽入；overlay 在 input 处理器与 rAF 里各调一次）
- `focusInstructionField(field, doc)`：延迟到布局稳定后再聚焦（`doc.defaultView.setTimeout(0)`，带 `isConnected` 防拆）
- `claimPanelForeground(panel, siblingPanels)`（R-A5）：焦点/交互归属提升——给 panel 加 `is-focused`（CSS z-index 31），并把兄弟面板上的同名类摘掉；DOM 插入顺序无关
- `InlineEditDismissKind` / `InlineEditDismissAction` / `InlineEditDismissCandidate` / `resolveDismissOwner({kind, candidates, anchorWithinSomeBar})`（R-A5，有单测）：并行条**取消归属裁决**。同一事件快照下每个开放条得到 `'none' | 'reject' | 'close-menu'` 之一：escape → 锚条（事件进入时持有焦点的条）拒绝、有菜单则只关菜单；锚在候选集之外（另一编辑器）或无锚且多条开放时全不动作；无锚且仅剩单条时保留旧语义（忙碌期 Esc 取消）。pointerdown → 条内指针永不取消任何条；条外被动路径仅原始条（`pristine`）拒绝、存活条关菜单。focusout → 仅源条可动且仅原始条拒绝；落点在任何条内（含另一条）不取消。纯函数：只读快照、返回逐条裁决；接线（锚采集与 per-event 记忆）在 `InlineEditOverlayDismissal`

## 依赖

- 仅 `./InlineEditTypes`（`InlineEditChoice` 类型）

## 维护约束

- 本模块**不得触碰 CM6 view 或 obsidian API**；几何函数纯数字换算，元素助手只允许填充/定位/测量递入的元素（读写其 style/class/offset/rect），不得反查文档或注册监听
- `resolvePanelTopAmongSiblings` 的翻转/钳制数学改动必须同步 `InlineEditInputOverlay.test.ts` 的用例（含实测缺陷几何回归用例：A top 288 / B preferred 393 / 面板高 135）
- 单面板零扰动是回归关键路径：任何改动后 `siblings: []` 用例必须仍然逐字节返回 `preferredTop`
