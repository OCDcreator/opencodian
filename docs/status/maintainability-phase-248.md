# 可维护性改进：第二百四十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-247.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（context picker lifecycle / retained-selection writeback extraction）

本轮继续按 lane map 的 P3 首查入口回到 `OpenCodianView` 的 composer/context seam，优先复审 add-context 文件选择器与 retained-selection UI writeback 的交界，而不是重新广扫 catalog 或其它聊天链路。确认低风险且有价值的集中点仍在 **文件选择器打开/关闭生命周期仍和 current-note / selection 入口动作挤在同一条 service 里，同时 picker open/close 对 retained-selection handoff 与 preview writeback 的装配还只能由 host adapter 临时兜底** 之后，本轮只做这一处切片：**新增 `ComposerContextPickerActionService`，把 add-context 文件选择器的打开/关闭、catalog 懒加载、file context draft 写回，以及 picker lifecycle 对 retained-selection handoff / preview refresh 的 host wiring 从原有 `ComposerContextActionService` 中拆出。**

这次改动保持 add-context 按钮、current-note / selection 入口、文件选择器取消语义，以及 file context 附件构建行为不变。变化点只在于 `ComposerContextActionService` 收窄回活动编辑器入口动作，而 picker 生命周期和 file-context 编排改由独立 service 负责。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextPickerActionService.ts`
  - 新增专用 picker action service
  - 集中文件选择器打开/关闭、catalog 加载、file context 构建与 draft 写回
- `src/features/chat/services/ComposerContextActionService.ts`
  - 删除文件选择器职责，收窄为 current-note / selection 两个活动编辑器入口
- `src/features/chat/services/ComposerContextHostAdapter.ts`
  - 新增 picker action service 装配
  - 把 picker open/close 生命周期分别桥接到 retained-selection handoff 与 preview refresh writeback
- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
  - 新增 picker action host 适配
- `src/features/chat/OpenCodianView.ts`
  - add-context 按钮改为直接委托新的 picker action service
  - 删除仅作转发的 `addChosenFileContextToActiveTab()` view 方法
- 测试
  - 新增 `tests/unit/features/chat/ComposerContextPickerActionService.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextActionService.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ComposerContextPickerActionService.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextActionService.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/ComposerContextPickerActionService.ts`
- `src/features/chat/services/ComposerContextActionService.ts`
- `src/features/chat/services/ComposerContextHostAdapter.ts`
- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ComposerContextPickerActionService.test.ts`
- `tests/unit/features/chat/ComposerContextActionService.test.ts`
- `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- `docs/modules/features/chat/services/ComposerContextPickerActionService.md`
- `docs/modules/features/chat/services/ComposerContextActionService.md`
- `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
- `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-248.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextActionService ComposerContextPickerActionService ComposerContextHostAdapter ComposerContextViewHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130456`

本轮未执行完整 `npm test` 的原因：

- attempt `243` 不可被 `5` 整除
- 改动未命中仓库规则要求全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3 推进，建议继续回到 `OpenCodianView` 的 composer/context ownership，优先复审 **current-conversation note path 读写与 focus preview activation 之间的宿主接缝**，寻找还能继续从 view 迁出的窄 bridge，而不是重新回到 catalog 或 chip render 细节。

一句话总结第二百四十八阶段本轮：

> 第二百四十八阶段新增 `ComposerContextPickerActionService`，把 add-context 文件选择器生命周期与 retained-selection / preview writeback 装配从原有 composer action service 中拆出，让 current-note / selection 入口与 picker 编排各自收敛到单一职责模块。
