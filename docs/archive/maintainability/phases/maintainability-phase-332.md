# 可维护性改进：第三百三十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-331.md`
> **推进的 master-plan lane**: P5 `appearance / glass / input panel state`
> **完成的 roadmap queue item**: `R17 - Input appearance and glass state coordinator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R17 - Input appearance and glass state coordinator`。本轮没有切到 R18 checkpoint、settings、新的 P2/P3/P4 切口或 `OpenCodeService`；只把聊天输入面板的 appearance / glass lifecycle 从 `OpenCodianView` 收束到一个独立 coordinator。

## 1. 本轮范围

- 新增 `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
  - 统一承接 input panel theme class、action button style、SVG filter layer、glass refraction defs、liquid-glass adapter mount/unmount 与 diagnostics fingerprint/logging
  - 通过 host seam 继续复用 composer shell / input wrapper DOM、messages shell 指标、plugin asset URL 解析，以及既有 log preview / payload stringify helper
  - 新 owner 为 **668 行**，覆盖 class sync / filter-layer lifecycle / liquid-glass adapter lifecycle / diagnostics 采样，不是微碎片 adapter
- 收缩 `src/features/chat/OpenCodianView.ts`
  - 主 view 不再直接持有 active liquid-glass adapter、composer SVG filter layer 或 liquid-glass diagnostics fingerprint
  - `applyChatAppearanceSettings()` 只再通过薄 seam 触发 `InputPanelAppearanceCoordinator`
  - `OpenCodianView.ts` 从上一轮 build 后的 **6792 行** 收缩到本轮 build 后的 **6203 行**
- 同步直接相关模块文档与 roadmap 状态
  - 更新 `ComposerInputShellCoordinator` / `OpenCodianView` 文档边界说明
  - 新增 `InputPanelAppearanceCoordinator` 模块文档
  - roadmap / lane map 已推进到 `R18`

## 2. 削弱的 owner 与缩短的链路

- 削弱的 owner：`src/features/chat/OpenCodianView.ts`
  - 主 view 不再直接铺开 input panel theme class 切换、SVG filter layer DOM ref、liquid-glass adapter mount/unmount 与 diagnostics 采样/去重
- 缩短的主链路：
  - 原链路：`OpenCodianView` → `applyInputPanelThemeState()` / `ensureComposerSvgFilterLayer()` / `unmountLiquidGlassAdapter()` / `logLiquidGlassDiagnostics()`
  - 现链路：`OpenCodianView` → `InputPanelAppearanceCoordinator`
- 刻意没有动的边界：
  - 没有改 theme preset、settings normalization、chat appearance CSS token 语义
  - 没有把 textarea submit gate、高度同步或 selector 行为混入 appearance owner；这些仍分别留在 `ComposerInputShellCoordinator` 与 `ChatSelectionControlsCoordinator`
  - 没有让 liquid diamond / glass octahedron experimental demos 进入稳定 UI 路径

## 3. 验证

- Targeted:
  - `npm test -- --runInBand --runTestsByPath tests/unit/features/chat/inputPanelTheme.test.ts tests/unit/features/chat/liquidGlassDiagnosticsLogging.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604132250`

## 4. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/features/chat/**`、`docs/modules/**` 与 `docs/status/**`，未命中 AGENTS 规定的 deploy-relevant runtime/style/settings 路径

## 5. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ComposerInputShellCoordinator.md`
- `docs/modules/features/chat/services/InputPanelAppearanceCoordinator.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-332.md`

## 6. 下一步建议

下一轮应按 roadmap 只做 `R18 - UI shell checkpoint and next-lane decision`：复盘 R13-R17 对 `OpenCodianView` 的缩减幅度、仍未迁出的 UI/runtime shell 边界，以及下一批是否应该转向 `OpenCodeService`；不要在 checkpoint 轮次里再开新代码重构。

一句话总结第三百三十二阶段本轮：

> 第三百三十二阶段完成 R17，把输入面板的 appearance / glass lifecycle 收束到 `InputPanelAppearanceCoordinator`，让 `OpenCodianView` 只保留 host wiring、settings seam 与 experimental demo toggle 入口。
