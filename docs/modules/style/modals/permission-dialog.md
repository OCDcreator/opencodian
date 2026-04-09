# Permission Dialog Styles

> **源码**: `src/style/modals/permission-dialog.css`
> **状态**: [FINAL]

## 职责

提供全屏权限确认弹窗的基础样式（遮罩、对话框、pattern 区域、命令展示与操作按钮）。

## 关键类名 / CSS 变量

- `.opencodian-permission-modal`、`.opencodian-permission-backdrop`：全屏容器与背景遮罩。
- `.opencodian-permission-dialog`：对话框主体。
- `.opencodian-permission-patterns`、`.opencodian-permission-command`：权限匹配与命令内容区。
- `.opencodian-permission-buttons`、`.opencodian-permission-once|always|reject`：动作按钮与语义色。

## 关联 TS 组件

- 当前仓库 `src/**/*.ts` 未检索到上述类名的直接消费方，推测为保留样式或待接回 UI 分支。

## 修改注意点

- 若后续重新启用该弹窗，建议先确认是否与 `inline-permission.css` 的内联流程存在重复。
- 不建议删减语义类（`once/always/reject`），避免未来接回时缺失样式。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
