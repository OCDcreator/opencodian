# Config Editor Modal Styles

> **源码**: `src/style/modals/config-editor-modal.css`
> **状态**: [FINAL]

## 职责

负责设置相关弹窗的大型样式集合，包括配置编辑器、会话设置、上下文消耗明细、模型可用性管理、模型工作区（workspace）与设置块组件。

## 关键类名 / CSS 变量

- 配置编辑：`.opencodian-config-editor*`、`.opencodian-config-help*`、`.opencodian-config-buttons`。
- 压缩帮助弹窗：`.opencodian-conversation-compaction-help-modal`、`.opencodian-conversation-compaction-help`、`.opencodian-compaction-help-*`（宽桌面卡片式 help modal，避免沿用默认窄容器和内部滚动）。
- 会话设置：`.opencodian-session-settings-*`（中性 hero、分组 card、两栏字段、内容自适应三态 segmented button、数字输入、错误提示，以及全局默认值摘要行）。
- 上下文统计：`.opencodian-context-breakdown*`、`.opencodian-context-modal-*`、`.opencodian-context-detail-modal*`。
- 模型开关管理：`.opencodian-model-toggle-*`。
- 模型工作区：`.opencodian-model-workspace-*`（平铺表单、预设选择器、provider 切换条、工具条、JSON 预览、状态徽章）。
- 设置区块：`.opencodian-settings-block*`。
- 代理设置：`.opencodian-agent-editor-*`、`.opencodian-agent-catalog-scroll`（项目代理编辑器分组卡片、默认折叠的高级区，以及代理目录最大高度 + 内部滚动）。
- MCP 设置：`.opencodian-mcp-*`（management toolbar + metric cards、server cards、runtime switch label、status/detail modal、editor modal grouped form）。
- provider 卡片 / 预设卡片：`.opencodian-settings-provider-*`、`.opencodian-preset-*`。

## 关联 TS 组件

- `src/features/settings/OpencodeConfigModal.ts`
- `src/features/settings/ModelConfigJsonModal.ts`
- `src/features/settings/ModelConfigModal.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/ConversationCompactionHelpModal.ts`
- `src/features/settings/SettingsAgentsSection.ts`
- `src/features/settings/SettingsProjectAgentEditor.ts`
- `src/features/settings/SettingsMcpSection.ts`
- `src/features/settings/SettingsMcpAddForm.ts`
- `src/features/settings/McpServerEditorModal.ts`
- `src/features/settings/McpServerStatusModal.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/ui/ContextDetailModal.ts`

## 修改注意点

- 该文件是“设置弹窗样式聚合点”，命名冲突风险高，新增类建议保持 `opencodian-<feature>-*` 前缀。
- 含较多响应式规则（`@media`），改网格列数、工具条折行或 footer 粘底时需同时检查窄屏可读性。
- `ContextDetailModal` 通过 `.opencodian-context-detail-modal` 直接覆盖 Obsidian 默认 modal 宽度；若切回 `:has(...)` 或改 class 名，需确认 raw message JSON 在宽窗口下不会再次被默认壳层截断。
- `ConversationCompactionHelpModal` 也通过专用 class 直接放宽 modal 宽度，并把内容做成 2×2 信息卡；如果改回 `.opencodian-config-help` 默认壳层，容易重新出现内容过窄和内部滚动问题。
- 代理设置相关样式现在混合了静态卡片和 `details/summary` 折叠区；如果修改 `.opencodian-agent-editor-group-summary` 的交互样式，需同时确认默认折叠的“高级配置”仍能看出可展开状态。
- `model availability` 里的 `.opencodian-model-availability-controls` 现在只负责布局，不再自带分组大卡片壳；如果后续想恢复这层视觉容器，先确认不会重新出现“外层模型 block 里再包一层 controls 大卡片”的双层嵌套感。
- `opencodian-agent-catalog-scroll` 只负责目录块的内部滚动高度，不应把整个 settings 容器再次改成双滚动。
- `opencodian-mcp-server-card-main` 默认是三列对齐，但窄屏会退化成单列；如果修改卡片 grid，记得同时检查状态 badge、transport badge 和按钮在移动宽度下不会重新挤压换行得太难看。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

## 2026-05-09 Session settings summary rows

`ConversationSessionSettingsModal` 的 Display 分组下方新增全局默认值摘要样式：

- `.opencodian-session-settings-summary-divider`：显示设置与只读摘要之间的分隔区。
- `.opencodian-session-settings-summary-row`：单行摘要的卡片 / grid 容器。
- `.opencodian-session-settings-summary-label`：摘要行左侧标签。
- `.opencodian-session-settings-summary-chips` / `.opencodian-session-settings-summary-chip`：右侧只读状态 chip 列表。
- `.opencodian-session-settings-summary-link`：跳转主设置页的 “Open settings” 按钮。
- 窄屏响应式规则会把摘要行改成单列，并让 chip 与按钮自然折行。
