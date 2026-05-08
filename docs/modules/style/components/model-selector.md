# Model Selector Styles

> **源码**: `src/style/components/model-selector.css`
> **状态**: [FINAL]

## 职责

定义聊天输入区模型选择器与其下拉菜单样式，并承载设置页中大量共享 UI（设置滚动条、快速导航、样式编辑控件等）。

## 关键类名 / CSS 变量

- 模型选择器：`.opencodian-model-selector`、`.opencodian-model-trigger*`、`.opencodian-model-dropdown*`、`.opencodian-model-option*`。输入工具栏内的 trigger 使用统一 control height / inline padding，与 Agent / permission selector 保持同一横向节奏；默认态是紧凑按钮，`action-buttons-etched` 下切换为透明刻入态。
- 选择态：`.is-open`、`.is-unavailable`、`.is-unconfigured`、`.is-highlighted`、`.is-selected`。
- 设置页通用：`.opencodian-settings*`、`.opencodian-settings-quick-nav*`、`.opencodian-settings-tabs-*`、`.opencodian-settings-tab-*`、`.opencodian-tooltip-trigger`。
- 样式面板通用：`.opencodian-style-*`、`.opencodian-theme-*`、滚动条规则（含 `.opencodian-history-scroll` 皮肤）。

## 近期行为

- **Linear-inspired redesign**（当前）：模型选择器触发器、下拉面板、搜索框、Provider 标题栏与选项全部重新设计。
  - 触发器：`padding: 4px 10px`、`font-weight: 500`；hover 时 `translateY(-1px)` + 柔和阴影抬升；`is-open` 态使用 accent 色边框 + 外发光。
  - Chevron：`cubic-bezier(0.4, 0, 0.2, 1)` 平滑旋转 180°，hover/open 时颜色递进。
  - 下拉面板：`border-radius: 16px`、三层阴影（含 1px 边框辉光）、`blur(40px) saturate(1.22)`；`model-dropdown-open` 入场动画通过 `.is-open` 类触发（由 TS 在打开/关闭时添加/移除）。
  - Trigger 新增 `role="button"`、`tabindex="0"`、`aria-haspopup="listbox"` 与 `aria-expanded`，使 `:focus-visible` 样式对键盘用户生效。
  - 搜索框：`border-radius: 12px`；`focus-within` 时 accent 色边框 + 微光背景；placeholder 更低透明度 + 字间距。
  - Provider header：`15px`/`font-weight: 800`、左侧 `3px solid var(--interactive-accent)` 竖线标识；`blur(28px)` 更强 sticky 背景；`10px` 渐变过渡阴影。
  - 选项：`padding: 6px 14px`、`font-weight: 450`；hover/highlighted 时左侧 accent 竖线 + `translateX(2px)`；selected 态使用 accent 背景 tint + `font-weight: 600`；checkmark 使用 `cubic-bezier(0.34, 1.56, 0.64, 1)` 弹性缩放出现。
  - 微交互：选项按 provider group 交错入场（`model-option-stagger`），`translateX(-6px)` 滑入；下拉滚动条自定义细滚动条（`5px`、hover 加深）；全链路 `prefers-reduced-motion: reduce` 兜底。
- classic 设置页 quick-nav 的 tooltip 现在不再依赖 `.opencodian-settings-quick-nav-btn` 的伪元素，而是用 `.opencodian-settings-quick-nav-tooltip-layer` / `-bubble` / `-arrow` 这组 body-level overlay 样式。这样提示层可以真正越过 settings 滚动容器，不再受容器裁切影响。


## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/settings/OpenCodianSettings.ts`

## 修改注意点

- 此文件体量大、覆盖面广；若只改模型下拉，务必限制在 `.opencodian-model-*` 作用域。
- `is-unconfigured` 与警示色用于配置异常提示，不建议弱化对比度。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
