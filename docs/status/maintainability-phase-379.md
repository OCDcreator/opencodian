# 可维护性改进：第三百七十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-378.md`
> **推进的 master-plan lane**: Maintainability / chat model selection
> **完成的 roadmap queue item**: `R44 - OpenCodianView model catalog/selection seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R44 - OpenCodianView model catalog/selection seam`。范围只收束 `OpenCodianView` 里的 model catalog load、requested/current/resolved selection、switch-model override 与 unavailable notice follow-up；没有混入 settings model catalog、OpenCode provider lookup、send pipeline 之外的流程改动，或 `OpenCodeService` transport seam。

## 1. 本轮范围

- 扩展 `src/features/chat/services/ChatSelectionControlsCoordinator.ts`，把 model catalog data load/cache、requested/current/resolved selection 推导、known-model metadata lookup、switch-model override、send 前 availability 校验与 unavailable notice 文案集中到现有 selection owner。
- 更新 `src/features/chat/OpenCodianView.ts`，只保留 selection host seam：model catalog data source、tab override/default selection 读写、model-source/server availability 查询、provider icon lookup、permission-mode writeback 与 effort selector 刷新；view 内原有 model-selection 分支改为直接委托 coordinator。
- 更新直接相关测试 `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts`，补充 requested→resolved fallback、base-catalog metadata lookup 与 selected-model unavailable follow-up coverage，并保留既有 selector / permission dropdown 回归。
- 只更新直接相关模块文档：`docs/modules/features/chat/OpenCodianView.md` 与 `docs/modules/features/chat/services/ChatSelectionControlsCoordinator.md`。

## 2. R44 收益

- `OpenCodianView` 不再直接持有 model catalog cache、requested/current/resolved selection 解析、switch-model notice 与 unavailable follow-up 这整段 model-selection lifecycle。
- `ChatSelectionControlsCoordinator` 现在同时拥有 selector UI lifecycle 与 selection runtime seam，避免 catalog/selection 分支继续散落在 view、本地 helper 与 send 前 availability 检查之间。
- provider icon fallback、disabled-model filtering、session model override、title-generation fallback 与 send pipeline 语义保持不变；`MessageSendPreparationService` 继续只经由 host seam 读取 selection 状态。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R44` 标记为 `[DONE]`，并把 `R45 - OpenCodeService streaming transport seam` 提升为新的 `[NEXT]`。
- `docs/status/maintainability-lane-map.md` 与 `docs/status/maintainability-master-plan.md` 已同步更新，反映当前 queue 顺序已推进到 `R45 -> R46`。
- 下一推荐切片：`R45 - OpenCodeService streaming transport seam`。

## 4. 验证

- Focused:
  - `npm test -- ChatSelectionControlsCoordinator MessageSendPreparationService`
- Full:
  - `npm test`：通过，`256 passed, 256 total` suites；`1087 passed, 1087 total` tests
  - `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604150056`

## 5. 部署

- 本轮命中的是 `src/features/chat/**`、tests 与 docs 路径，不属于本仓库约定的 Test Vault 强制部署范围。
- 因此未执行 Test Vault 部署。

## 6. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
- `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ChatSelectionControlsCoordinator.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-379.md`

## 7. 下一步

- 继续按 queue 执行 `R45 - OpenCodeService streaming transport seam`。
- 保持本轮边界，不回切 chat selector 之外的 settings/model UI 细节，也不提前做 `R46` checkpoint。

一句话总结第三百七十九阶段本轮：

> 第三百七十九阶段完成 `R44`，把 `OpenCodianView` 的 model catalog/selection lifecycle 收束到 `ChatSelectionControlsCoordinator`，并将 maintainability queue 顺延到 `R45` 的 streaming transport seam。
