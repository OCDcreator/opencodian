# Config Status Styles

> **源码**: `src/style/components/config-status.css`
> **状态**: [FINAL]

## 职责

为设置页中的权限模式与标题模型状态提供语义化颜色提示，突出 warning / yolo / normal / plan / custom 等状态。

## 关键类名 / CSS 变量

- `.opencodian-status-warning`、`.opencodian-status-yolo`、`.opencodian-status-normal`、`.opencodian-status-plan`、`.opencodian-status-custom`：作用于 `.setting-item-description` 的状态色。
- `.opencodian-title-model-warning-button`：标题模型异常提示按钮样式。
- 依赖变量：`--opencodian-status-warning`、`--opencodian-status-warning-subtle`。

## 关联 TS 组件

- `src/features/settings/OpenCodianSettings.ts`

## 修改注意点

- 状态颜色语义需与设置逻辑保持一致，避免 “文字颜色含义” 与真实状态不符。
- 该模块只做状态色，不要在这里扩展通用按钮布局。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
