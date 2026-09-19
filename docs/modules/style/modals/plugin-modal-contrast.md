# Plugin Modal Contrast Contract

> **源码**: `src/style/modals/plugin-modal-contrast.css`
> **状态**: [REVIEW]

## 概述

R-A6 及同类缺陷的**唯一共享规则集**：插件自有弹窗内的按钮标签与警示正文对比度契约。此前 tooling-confirm、batch-organize、image-generation、inline-edit-confirm 各自维护覆盖规则（或各自裸奔），已经出现漂移——canvas 改写预览的「写回」`.mod-cta` 与 `--text-error` 警示段落双双落在覆盖之外（实测 2.87:1 / 4.20:1，均低于 13px 文本的 4.5:1 下限）。本模块用一组 `:is(...)` 作用域规则同时覆盖全部六类插件弹窗，宿主弹窗永不被改。

## 作用域（插件弹窗根类）

`.opencodian-inline-edit-confirm-modal`、`.opencodian-batch-organize-modal`、`.opencodian-imagegen-modal`、`.opencodian-tooling-confirm-modal`、`.opencodian-canvas-modal`（canvas 改写三弹窗 + 生成模式弹窗）、`.opencodian-pdf-annotation-modal`。后两类是本模块新增的弹窗级根类（原先没有）。

## 实测契约（数字来自实机测量，非源码推算）

真实计算样式经 canvas 光栅化、WCAG 相对亮度、source-over 合成（部署版实机）：

| 表面 | 底色 | 标签 | 实测比值 | 判定 |
|---|---|---|---|---|
| `.mod-cta` | rgb(170,17,65)（宿主 accent） | rgb(0,0,0) | 2.87:1 | FAIL |
| `.mod-warning.mod-destructive.mod-cta` | rgb(211,47,47) | rgb(0,0,0) | 4.22:1 | FAIL |
| 同危险底 + **白标签**（f33732bc 后实机复测） | rgb(211,47,47) | rgb(255,255,255) | **4.98:1** | PASS |
| 白标签 @ 同一 accent 底（实测底色 + 白标签计算） | rgb(170,17,65) | rgb(255,255,255) | **7.33:1** | PASS |
| 裸 `--text-error` 作弹窗正文 | — | — | 4.20:1 | FAIL |

真实对比度无法单测——本模块的单测只断言规则存在、作用域命中与无矛盾副本；比值来自主智能体 live 测量，改动后须由 live 验收复核。

## 修复方向：只改标签，不动底色

同一底色换白标签两个表面全部达标（7.33:1 / 4.98:1），因此契约是**保留宿主的色相/底色、提亮标签**：

- **不提亮底色**——只在浅色主题成立、深色主题反向劣化，且软化危险信号违反 DESIGN.md §2 Status Honesty Rule。
- **不再用 ink 混色底**——f33732bc 在 inline-edit 确认弹窗写入的 `color-mix(#e11d48, #0f172a)` 底色经实机复测**从未生效**（标签变白落地了，底色仍是宿主 rgb(211,47,47)）：主题在 `background-color` 上以更高特异性压过插件的 (0,2,0) 选择器，而 `color` 上压不过。诚实的契约因此是「宿主自有危险/accent 底 + 浅标签」，文档记录的是**实际观测值**（4.98:1），不是那个到不了屏幕的混色的算术值。本模块刻意**不声明 background**——它只可能输掉级联，而「静默不生效」正是本模块要终止的漂移。

## 级联有效性

- `color: #fff` + `--text-color: #fff`（(0,2,0)）：`color` 在实机弹窗上已验证可胜出（f33732bc 的白标签确实落地）；`--text-color` 是对主题可能经 `button { color: var(--text-color) }` 再派生标签的双保险。
- 背景**不声明**（见上）。每个作用域弹窗的实机复测由验收方执行。

## 警示正文

`.opencodian-modal-warning-note`（共享变量 `--opencodian-modal-warning-ink` = `color-mix(--text-error 72%, --text-normal)`，仓库既有配方）替代裸 `--text-error` 正文；72% 混色为算术估算（该主题约 5.7:1），未经实机测量，待验收复核。batch-organize 的冲突行/校验错误、imagegen 的错误条、canvas 与 pdf 预览的警示段落均已迁移到该变量/类。

## 关联文件

- TS 根类来源：`InlineEditConfirmModal.ts`、`BatchOrganizeModal.ts`、`ImageGenerationModal.ts`、`ObsidianToolingApprovalModal.ts`、`CanvasRewriteModals.ts`、`CanvasGenerationFlow.ts`、`PdfAnnotationPreviewModal.ts`。
- 契约测试：`tests/unit/uiCssDesignContract.test.ts`（「shared plugin modal contrast contract」块）。

## 修改注意点

- 新增插件弹窗且使用 `setCta()`/`setWarning()` 时：加弹窗级根类并把类名加入本模块三处 `:is(...)` 列表与契约测试 `CONTRAST_MODAL_CLASSES`——不要再写每弹窗覆盖。
- 禁止重新引入底色改写（mix 或提亮）；禁止让裸 `.mod-destructive`（半透明底）吃到白标签。
- 状态语义必须保持可分辨：危险/主操作按钮仍是「实底 + 浅标签」，与中性按钮（accent/25 底 + 深标签，实测 7.94:1 达标）视觉分离。
