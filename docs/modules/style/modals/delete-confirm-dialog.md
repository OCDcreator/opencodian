# Delete Confirm Dialog Styles

> **源码**: `src/style/modals/delete-confirm-dialog.css`
> **状态**: [FINAL]

## 职责

定义会话删除确认弹窗与重命名弹窗样式，强调危险操作提示与按钮层级。

## 关键类名 / CSS 变量

- 删除确认：`.opencodian-delete-confirm-overlay`、`.opencodian-delete-confirm-dialog`、`.opencodian-delete-confirm-warning`。
- 按钮：`.opencodian-delete-confirm-confirm`、`.opencodian-delete-confirm-cancel`、`.opencodian-delete-confirm-btn`。
- 重命名：`.opencodian-rename-dialog-*`（overlay、input、buttons）。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`

## 修改注意点

- 危险确认按钮是视觉主动作，取消按钮刻意做了更大点击面积，调整时需保留可操作性。
- 这组弹窗使用 fixed overlay，若调 z-index 需同时验证与其他 modal 的叠层关系。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
