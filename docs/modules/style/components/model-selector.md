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

- classic 设置页 quick-nav 的 tooltip 现在不再依赖 `.opencodian-settings-quick-nav-btn` 的伪元素，而是用 `.opencodian-settings-quick-nav-tooltip-layer` / `-bubble` / `-arrow` 这组 body-level overlay 样式。这样提示层可以真正越过 settings 滚动容器，不再受容器裁切影响。


## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/settings/OpenCodianSettings.ts`

## 修改注意点

- 此文件体量大、覆盖面广；若只改模型下拉，务必限制在 `.opencodian-model-*` 作用域。
- `is-unconfigured` 与警示色用于配置异常提示，不建议弱化对比度。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
