# Permission Mode Selector Styles

> **源码**: `src/style/components/permission-mode-selector.css`
> **状态**: [FINAL]

## 职责

定义聊天工具栏权限模式选择器（yolo / normal / plan）的触发器与下拉选项视觉，并提供模式语义色。

## 关键类名 / CSS 变量

- `.opencodian-permission-selector`：选择器容器。
- `.opencodian-permission-trigger` + `mode-yolo|mode-normal|mode-plan`：当前模式显示与颜色。
- `.opencodian-permission-dropdown`：弹出菜单容器。
- `.opencodian-permission-option*`：选项项、图标、描述与选中勾选。
- `[data-mode="..."]`：按模式给图标着色。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`

## 修改注意点

- 模式色语义与行为绑定（成功/默认/计划），不要把三种模式做成几乎同色。
- 下拉体验与模型选择器需保持视觉一致（圆角、玻璃态、阴影等级）。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
