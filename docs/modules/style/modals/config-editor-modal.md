# Config Editor Modal Styles

> **源码**: `src/style/modals/config-editor-modal.css`
> **状态**: [FINAL]

## 职责

负责设置相关弹窗的大型样式集合，包括配置编辑器、会话设置、上下文消耗明细、模型可用性管理、模型工作区（workspace）与设置块组件。

## 关键类名 / CSS 变量

- 配置编辑：`.opencodian-config-editor*`、`.opencodian-config-help*`、`.opencodian-config-buttons`。
- 会话设置：`.opencodian-session-settings-*`（中性 hero、分组 card、两栏字段、内容自适应三态 segmented button、数字输入与错误提示）。
- 上下文统计：`.opencodian-context-breakdown*`、`.opencodian-context-modal-*`、`.opencodian-context-detail-modal*`。
- 模型开关管理：`.opencodian-model-toggle-*`。
- 模型工作区：`.opencodian-model-workspace-*`（平铺表单、预设选择器、provider 切换条、工具条、JSON 预览、状态徽章）。
- 设置区块：`.opencodian-settings-block*`。
- provider 卡片 / 预设卡片：`.opencodian-settings-provider-*`、`.opencodian-preset-*`。

## 关联 TS 组件

- `src/features/settings/OpencodeConfigModal.ts`
- `src/features/settings/ModelConfigJsonModal.ts`
- `src/features/settings/ModelConfigModal.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `src/features/chat/ui/ContextDetailModal.ts`

## 修改注意点

- 该文件是“设置弹窗样式聚合点”，命名冲突风险高，新增类建议保持 `opencodian-<feature>-*` 前缀。
- 含较多响应式规则（`@media`），改网格列数、工具条折行或 footer 粘底时需同时检查窄屏可读性。
- `ContextDetailModal` 通过 `.opencodian-context-detail-modal` 直接覆盖 Obsidian 默认 modal 宽度；若切回 `:has(...)` 或改 class 名，需确认 raw message JSON 在宽窗口下不会再次被默认壳层截断。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
