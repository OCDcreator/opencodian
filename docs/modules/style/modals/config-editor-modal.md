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
- 代理 / 命令设置目录：`.opencodian-agent-editor-*`、`.opencodian-settings-catalog-scroll`、`.opencodian-agent-catalog-scroll`、`.opencodian-command-catalog-scroll`（项目代理编辑器分组卡片、默认折叠的高级区，以及代理 / 命令目录最大高度 + 内部滚动）。
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
- `opencodian-settings-catalog-scroll` 只负责目录块的内部滚动高度，不应把整个 settings 容器再次改成双滚动。
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

## 2026-05-12 Model availability density slice

模型可用性 / provider 管理区现在映射到共享 settings hierarchy token：

- search / filter controls 使用 inline tokens，不再像独立 glass toolbar。
- catalog summary card 与 provider row 使用 object tokens，不使用渐变、blur、hover lift 或装饰性阴影。
- 展开的 model row 使用 row tokens，避免 provider object row 内再出现另一套完整卡片家族。
- status badge 保留语义色，因为 provider / model availability 是决策关键状态。

Guardrail: 不要在 `.opencodian-model-toggle-provider` / `.opencodian-model-toggle-model` 上重新引入 `linear-gradient`、`backdrop-filter`、hover `translateY` 或 black-tinted card shadow。

## 2026-05-12 MCP/server density slice

MCP management 现在遵守共享 settings hierarchy token：

- management toolbar 使用 inline tokens，不再自成一张本地 toolbar 卡片。
- overview metrics、server cards、details panels 和 editor form groups 使用 object tokens。
- helper / error / empty rows 使用 row tokens。
- MCP status badges 保留语义色，因为 runtime connection、auth、failure 和 disabled 状态会影响用户决策。

Guardrail: 不要在 `.opencodian-mcp-*` 管理区重新引入 MCP-only card family，也不要使用渐变、decorative blur、hover lift、side-stripe border 或 shadowed nested cards。

## 2026-05-12 Formatter density slice

Formatter settings 现在使用共享 settings hierarchy token：

- summary cards、runtime list、builtin rows 和 custom rows 使用 object tokens。
- runtime table、override fields、custom fields 和 JSON editor 使用 row tokens。
- environment key/value rows 使用 inline tokens。
- enabled / disabled formatter badges 保留语义状态色。

Guardrail: 不要引入 formatter-only card hierarchy、渐变、decorative blur、hover lift、side-stripe border 或未定义的 settings radius token。

## 2026-05-12 Agents / Commands / Plugin catalog density slice

Agents、Commands 和 Plugin settings 现在共享同一组 plugin/catalog density contract：

- `.opencodian-plugin-block` 是无框 section shell，不再是一张嵌套大卡片。
- catalog `Setting` rows 和 plugin summary rows 使用 row tokens。
- agent editor groups 和 plugin source items 使用 object tokens。
- plugin source paths 使用 inline tokens。

Guardrail: 不要在 `.opencodian-plugin-block*`、`.opencodian-settings-catalog-scroll`、`.opencodian-agent-editor-*` 或 `.opencodian-plugin-source-*` 重新引入大卡片套小卡片、渐变、decorative blur、hover lift、side-stripe border 或未定义的 settings radius token。
