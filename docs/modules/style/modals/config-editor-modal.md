# Config Editor Modal Styles

> **源码**: `src/style/modals/config-editor-modal.css`
> **状态**: [FINAL]

## 职责

负责设置相关弹窗的大型样式集合，包括配置编辑器、上下文消耗明细、模型可用性管理、模型工作区（workspace）与设置块组件。

## 关键类名 / CSS 变量

- 配置编辑：`.opencodian-config-editor*`、`.opencodian-config-help*`、`.opencodian-config-buttons`。
- 上下文统计：`.opencodian-context-breakdown*`、`.opencodian-context-modal-*`。
- 模型开关管理：`.opencodian-model-toggle-*`。
- 模型工作区：`.opencodian-model-workspace-*`（侧栏、编辑区、advanced 区块、状态徽章）。
- 设置区块：`.opencodian-settings-block*`。

## 关联 TS 组件

- `src/features/settings/OpencodeConfigModal.ts`
- `src/features/settings/ModelConfigJsonModal.ts`
- `src/features/settings/ModelConfigModal.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/chat/ui/ContextDetailModal.ts`

## 修改注意点

- 该文件是“设置弹窗样式聚合点”，命名冲突风险高，新增类建议保持 `opencodian-<feature>-*` 前缀。
- 含较多响应式规则（`@media`），改网格列数时需同时检查窄屏可读性。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
