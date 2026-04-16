# 可维护性改进：第三百三十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-330.md`
> **推进的 master-plan lane**: P1 `OpenCodianView selection controls`
> **完成的 roadmap queue item**: `R16 - Model and permission selector ownership`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R16 - Model and permission selector ownership`。本轮没有切到 input appearance / glass、settings catalog 或 `OpenCodeService`；只把聊天工具栏内的 model selector 与 permission selector dropdown/search/list/selection display ownership 从 `OpenCodianView` 迁到一个共享 coordinator。

## 1. 本轮范围

- 新增 `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
  - 统一承接 model selector 与 permission selector 的 trigger/dropdown lifecycle、model search/list/sticky header cleanup、provider icon refresh 和 permission mode selected-state
  - 通过 host seam 继续复用既有 model catalog 数据源、provider icon service、tab model override writeback、permission mode settings 持久化与 OpenCode service 重启逻辑
  - 新 owner 为 **567 行**，覆盖 build / reload / display / locale / destroy 等完整 lifecycle，不是微碎片 adapter
- 收缩 `src/features/chat/OpenCodianView.ts`
  - 主 view 不再直接持有 model/permission dropdown refs、search input、click-outside handler、sticky-header cleanup 或 open/close state machine
  - `reloadModelCatalog()`、model trigger display 与 permission mode writeback 改为通过 coordinator seam 驱动
  - `OpenCodianView.ts` 从上一轮 build 后的 **7277 行** 收缩到本轮 build 后的 **6792 行**
- 调整相邻 owner 与 focused coverage
  - `src/features/chat/services/ComposerInputShellCoordinator.ts` 改为通过单一 `mountSelectionControls()` seam 挂载 selector 区域
  - 新增 `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
  - 更新直接相关模块文档与索引

## 2. 削弱的 owner 与缩短的链路

- 削弱的 owner：`src/features/chat/OpenCodianView.ts`
  - 主 view 不再直接铺开 model selector dropdown search/list/keyboard navigation/provider icon display，也不再直接维护 permission selector dropdown selected-state / open-close lifecycle
- 缩短的主链路：
  - 原链路：`OpenCodianView` → `initializeModelSelector()` / `buildModelDropdown()` / `updateModelSelectorDisplay()` + `initializePermissionSelector()` / `buildPermissionDropdown()` / `togglePermissionDropdown()`
  - 现链路：`OpenCodianView` → `ChatSelectionControlsCoordinator`
- 刻意没有动的边界：
  - 没有改 settings model catalog、`ModelCatalogStateService`、provider availability 语义或 icon fallback 顺序
  - 没有改 send pipeline options、reasoning/thinking budget 语义或 `MessageSendPreparationService`
  - 没有改 liquid-glass adapter mount、SVG filter、theme class 与 diagnostics；这些留给 `R17`

## 3. 验证

- Targeted:
  - `npm test -- --runInBand --runTestsByPath tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts tests/unit/features/chat/MessageSendPreparationService.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604132235`

## 4. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/features/chat/**`、`tests/unit/features/chat/**`、`docs/modules/**` 与 `docs/status/**`，未命中 AGENTS 规定的 deploy-relevant runtime/style/settings 路径

## 5. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
- `src/features/chat/services/ComposerInputShellCoordinator.ts`
- `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts`
- `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ChatSelectionControlsCoordinator.md`
- `docs/modules/features/chat/services/ComposerInputShellCoordinator.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-331.md`

## 6. 下一步建议

下一轮应按 roadmap 推进 `R17 - Input appearance and glass state coordinator`：优先收束 input panel theme class、SVG filter layer、liquid-glass adapter mount 与 diagnostics state，不要回到 selector ownership 或 settings/core catalog 语义。

一句话总结第三百三十一阶段本轮：

> 第三百三十一阶段完成 R16，把聊天工具栏里的 model / permission selector 状态机收束到 `ChatSelectionControlsCoordinator`，让 `OpenCodianView` 只保留 catalog data、settings writeback 与 send-option 相关 seam。
