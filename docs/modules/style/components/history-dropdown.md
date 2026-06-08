# History Dropdown Styles

> **源码**: `src/style/components/history-dropdown.css`
> **状态**: [FINAL]

## 职责

管理会话历史下拉面板视觉，包含会话条目、选择态、编辑入口、底部危险操作区与独立滚动容器。

## 关键类名 / CSS 变量

- `.opencodian-history-dropdown`：下拉卡片容器（玻璃态背景）。
- `.opencodian-history-scroll`：可滚动列表区域。
- `.opencodian-history-scope`：后端作用域标签（大写、字间距、增强后的 muted 对比度，避免在玻璃背景上过淡）。
- `.opencodian-history-item` + `is-active` / `is-selected`：会话条目状态。
  - `is-active`：左侧 3px 强调色边框 + 极淡中性背景。
  - `is-selected`：中性高亮背景，复选框提供主视觉信号。
  - `is-active.is-selected`：组合上述两者。
- `.opencodian-history-item-status.is-pending|is-failed`：标题生成状态标记（小药丸样式，含背景和边框）。
- `.opencodian-history-footer`、`.opencodian-history-action`：底部操作区（删除目标/删除全部等）。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationHistoryActionsCoordinator.ts`

## 修改注意点

- `.opencodian-history-item` 的多状态组合较多，新增状态前需避免与 `is-active.is-selected` 冲突。
- 底部区域是固定 footer 语义，调整 padding/margin 时要检查长列表下的可达性。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
