# Batch Organize Modal Styles

> **源码**: `src/style/modals/batch-organize-modal.css`
> **状态**: [FINAL]

## 职责

负责「批量整理笔记」（R-B5）弹窗的样式：任务模板配置、执行前预览清单、执行中与结果四个阶段的呈现，以及回退确认弹窗的按钮语义。全部间距取自 `DESIGN.md` §5 Modal Layout 的共享 `--opencodian-modal-*` token，不写 ad-hoc margin。

## 关键类名 / CSS 变量

- 弹窗根：`.opencodian-batch-organize-modal`（由 `BatchOrganizeModal.onOpen` 加到 `modalEl`，`onClose` 移除）。在此声明全套 modal token：内容内边距 `22px`、header/body `16px`、区块 `20px`、区块内 `12px`、卡片 `12px`、表单行 `12px`、label/control 列 `16px`、动作行 `8px`；宽度 `min(640px, 100vw - 40px)`。
- 内容壳：`.opencodian-batch-organize-modal .modal-content` 用 token 加内边距（`box-sizing: border-box`）。
- 标题与正文：`h3` 为 §3 Title（700 / 14px / 1.35）；`.opencodian-batch-organize-hint` 与 `-body` 为 §3 Body（13px / 1.5），`margin: 0`，间距一律由 token 承担。
- 表单行：`.opencodian-batch-organize-row` 为 `grid-template-columns: minmax(0, 1fr) minmax(220px, max-content)`，列间距取 `--opencodian-modal-form-label-control-gap`；`row` 的 12px 行距由共享的 `.opencodian-modal-form-grid` 拥有。条件行用 `[hidden]` 隐藏。
- 控件列：`.opencodian-batch-organize-control`（`max-width: 420px`，内部 `input[type=text]` / `select` 满宽），`.opencodian-batch-organize-control-stack` 把同格的两个控件按 8px 堆叠。
- 内联校验错误：`.opencodian-batch-organize-error`（10% `--background-modifier-error` 色调块、警示墨色读共享变量 `--opencodian-modal-warning-ink`（`plugin-modal-contrast.css`，`--text-error` 72% 混 `--text-normal`）保证双主题可读；`:empty` 时完全隐藏）。**不使用侧边条纹**。
- 预览清单：`.opencodian-batch-organize-list`（有界 260px 内部滚动、10px 圆角、`--background-secondary` 底）、`.opencodian-batch-organize-item`（mono 路径、`overflow-wrap: anywhere`，hover 用 `--background-modifier-hover`）；冲突/跳过项 `.opencodian-batch-organize-conflict` 与 `.opencodian-batch-organize-conflict-summary` 用低彩度着色，不铺满整行。
- 执行中：`.opencodian-batch-organize-running`、`.opencodian-batch-organize-spinner`（状态指示用旋转，`opencodian-batch-organize-spin` 0.9s linear；reduced-motion 下放慢到 1.8s）。
- 主按钮配色：`.mod-cta`/`.mod-warning` 保留宿主实底，**标签浅色化由共享契约 `plugin-modal-contrast.css` 承担**（accent 底实测 2.87:1 FAIL → 白标签换算 7.33:1 PASS）。历史记录：本模块曾把 accent 与 ink-graphite 混色以"修"对比度，实机测量否证了它——当前主题配对是 `--interactive-accent: #aa1141` + `--text-on-accent: black`，压暗底色只会让近黑标签更难读（2.87:1 → **2.2:1**）。底色改写路线（混色或提亮）双双废弃：混色方案在 inline-edit 确认弹窗上被实机复测证明根本不会落地。
- 焦点与响应式：`:focus-visible` 统一 2px accent 描边 + 2px offset；≤720px 时表单行塌为单列、控件左对齐、`max-width: none`。

## 关联 TS 组件

- `src/app/batchOrganize/BatchOrganizeModal.ts`（该文件是 DOM 合同来源：类名与行结构在此定义）
- `src/app/batchOrganize/BatchOrganizeCoordinator.ts`（阶段推进与结果数据）
- `src/shared/batchOrganizePlan.ts`（预览清单与目录计划的数据形状）

## 修改注意点

- DOM 合同与 CSS 必须同步改：类名或行结构变了要一起改 `BatchOrganizeModal.ts`，否则 `.opencodian-modal-form-grid` 的行距与两列网格会失效。
- 新增间距一律走 modal token；不要给单个元素补 margin，`DESIGN.md` §5 明确禁止 ad-hoc margins。
- 不要给错误块或冲突行加侧边条纹（`border-left`/`border-right` 大于 1px）——那是共享绝对禁令；风险表达靠色调与文字。
- 预览清单是「有界滚动 + 路径换行」的所有者；改 `max-height` 或去掉 `overflow-wrap` 会让长路径撑破弹窗。
- 不要再给 `.mod-cta`/`.mod-warning` 覆盖背景色，也不要在本文件恢复按钮过渡或警示墨色副本——两者都由共享契约 `plugin-modal-contrast.css` 唯一拥有。任何「压暗 accent 以提亮白字」的改法在这类主题下都会反向劣化。
- 契约测试 `tests/unit/uiCssDesignContract.test.ts` 断言本文件的 token 值与禁令；改动这些值需同步更新断言。
