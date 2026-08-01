# 可维护性改进：第三百三十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-329.md`
> **推进的 master-plan lane**: P1 `OpenCodianView composer input shell`
> **完成的 roadmap queue item**: `R15 - Composer input shell coordinator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R15 - Composer input shell coordinator`。本轮没有切到 model/permission selector、input appearance/glass 或 `OpenCodeService`；只把输入区 shell DOM、textarea submit/height、send/stop affordance 与 composer layout metrics 从 `OpenCodianView` 迁到一个较厚 coordinator。

## 1. 本轮范围

- 新增 `src/features/chat/services/ComposerInputShellCoordinator.ts`
  - 统一承接 input tab slot、composer shell、textarea、自适应高度、submit gate、send/stop tooltip 与 composer stack height lifecycle
  - 通过 host seam 继续调用既有 question/todo dock、composer context、model selector、permission selector、context usage 与 effort selector 挂载逻辑
- 收缩 `src/features/chat/OpenCodianView.ts`
  - `buildInputArea()`、`trySubmitCurrentInput()`、`syncInputTextareaHeight()` 和 composer layout metrics 细节离开主 view
  - view 只创建 `ComposerInputShellCoordinator`、提供 host callbacks，并在 theme/glass 逻辑里按需读取 shell refs
  - `OpenCodianView.ts` 从上一轮 build 后的 **7414 行** 收缩到本轮 build 后的 **7277 行**
- 补齐 focused coverage 与直接相关文档
  - 新增 `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/inputPanelTheme.test.ts`，让 harness 绑定 coordinator 已接管的 shell refs
  - 新增 `docs/modules/features/chat/services/ComposerInputShellCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md` 与 `docs/modules/README.md`

## 2. 削弱的 owner 与缩短的链路

- 削弱的 owner：`src/features/chat/OpenCodianView.ts`
  - 主 view 不再直接持有 input shell DOM refs、textarea Enter-submit、高度同步、composer layout RAF/observer，以及 send/stop button tooltip 细节
- 缩短的主链路：
  - 原链路：`OpenCodianView` → `buildInputArea()` / `trySubmitCurrentInput()` / `syncInputTextareaHeight()` / `initializeComposerLayoutMetrics()` / `syncComposerLayoutMetrics()`
  - 现链路：`OpenCodianView` → `ComposerInputShellCoordinator`
- 刻意没有动的边界：
  - 没有改 model selector / permission selector dropdown 状态机；这留给 `R16`
  - 没有改 liquid-glass adapter mount、SVG filter 与 diagnostics；这留给 `R17`
  - 没有改 send pipeline runtime、streaming parser、P2 question/todo/background-task 或 P3/P4 已收束边界

## 3. 验证

- Targeted:
  - `npm test -- --runInBand --runTestsByPath tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604132211`

## 4. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/features/chat/**`、`tests/unit/features/chat/**`、`docs/modules/**` 与 `docs/status/**`，未命中 AGENTS 规定的 deploy-relevant runtime/style/settings 路径

## 5. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ComposerInputShellCoordinator.ts`
- `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- `tests/unit/features/chat/inputPanelTheme.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ComposerInputShellCoordinator.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-330.md`

## 6. 下一步建议

下一轮应按 roadmap 推进 `R16 - Model and permission selector ownership`：优先收束 chat 内 model selector 与 permission selector 的 dropdown/search/list/selection display，不要混入 input appearance/glass state 或 settings/core catalog 语义。

一句话总结第三百三十阶段本轮：

> 第三百三十阶段完成 R15，把 `OpenCodianView` 的 composer input shell 收束到 `ComposerInputShellCoordinator`，让主 view 只保留 host callbacks、toolbar 子控件挂载与 appearance/glass 读取 seams。
