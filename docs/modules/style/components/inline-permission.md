# Inline Permission Styles

> **源码**: `src/style/components/inline-permission.css`
> **状态**: [FINAL]

## 职责

覆盖聊天内联权限卡片、问题卡片（Question Inline）与上下文文件选择弹窗（Context File Picker）的样式。

## 关键类名 / CSS 变量

- 权限卡：`.opencodian-permission-inline*`、`.opencodian-permission-inline-btn`、`.opencodian-permission-completed`。
- 问题卡：`.opencodian-question-inline*`（含 `--resolved`、按钮、选项、进度和摘要列表）。
- 文件选择弹窗：`.opencodian-context-file-modal`、`.opencodian-context-file-search`、`.opencodian-context-file-filter*`、`.opencodian-context-file-item*`。
- 状态提示：`.opencodian-permission-inline-granted`、`.opencodian-permission-inline-rejected`。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/ui/QuestionDock.ts`
- `src/features/chat/ui/ContextFilePickerModal.ts`

## 修改注意点

- 此文件同时服务 3 套 UI，改一个区块前先确认类名前缀，避免误伤其他卡片。
- 权限按钮颜色有明确语义（once/always/session/reject）；`session` 使用略淡的 accent 色，位置介于 always 与 reject 之间。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
