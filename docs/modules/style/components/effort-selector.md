# Effort Selector Styles

> **源码**: `src/style/components/effort-selector.css`
> **状态**: [FINAL]

## 职责

定义推理强度（effort）与预算（budget）切换控件样式，服务输入工具栏中的轻量下拉交互。runtime rail 内只显示当前值（如 `Medium`），`Effort` / `思考强度`、概念解释与生效边界说明由 `aria-label` / custom tooltip 暴露，避免在输入框里挤出长标签。`action-buttons-etched` 下跟随输入面板切换为透明刻入态。当前值会为 `Medium` 等完整英文标签预留宽度，不使用单字母缩写。

## 关键类名 / CSS 变量

- `.opencodian-effort-selector`、`.opencodian-effort-slot`：选择器容器。
- `.opencodian-effort-group`：compact runtime chip，承载 accessible label，但不再作为 tooltip trigger，避免弹出菜单内 hover 时父级 tooltip 抢占。
- `.opencodian-effort-gears`、`.opencodian-effort-current`、`.opencodian-effort-options`：当前值与弹出选项；当前值和每个 `.opencodian-effort-gear` 都是 custom tooltip trigger。
- `.opencodian-effort-gear.selected`：已选项高亮态。

## 关联 TS 组件

- `src/features/chat/ui/EffortSelector.ts`
- `src/features/chat/OpenCodianView.ts`

## 修改注意点

- 下拉显示依赖 `.is-open` 和 `:has(:hover)`，改交互时要同步验证键盘/鼠标两种路径。
- options 使用 `box-sizing: border-box`；运行时从 trigger 右边缘锚定，并由共享控制器限制在 Chat 容器左右 8px 安全区。
- 控件位于输入工具栏，宽度与字号改动会影响模型/权限选择器排布；不要把 `Medium` 压缩成 `M` 或中文单字母式缩写。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
