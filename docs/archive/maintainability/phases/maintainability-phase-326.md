# 可维护性改进：第三百二十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-325.md`
> **推进的 master-plan lane**: Core config maintainability
> **完成的 roadmap queue item**: `R11 - Core catalog state service`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R11 - Core catalog state service`。本轮围绕 `ModelConfigService` 提供了新的 `ModelCatalogStateService`，把 settings/model 目录里原本仍由 `SettingsModelCatalogPresenter` 和 `OpenCodianSettings` 手工组合的 **`baseEffective` / `effective` / `currentEnabledProviderIds` availability 语义** 收束回 core。现在 settings 侧通过 `getCatalogState()` 消费稳定的 `ModelCatalogState`，并把 provider/model availability 的 bulk writeback 也委托给这个 core owner，从而削弱了两个 owner：

- **`SettingsModelCatalogPresenter`** 不再自己构建 disabled/server/effective 目录状态、disabled placeholder 与 provider disabled scope
- **`OpenCodianSettings`** 不再手工拼 `knownProviderIds`、`serverConfig` 继承写回和 `disabledModelRefs` 归并

本轮刻意**没有**改变 `ModelConfigService` 的 `baseEffective` 与 filtered `effective` 区分，也**没有**改变 server provider discovery 语义；`config.providers(directory)` / runtime catalog 仍然是 `服务器目录` 的事实来源，UI 只改消费方式，不改底层目录真值。

## 1. 本轮范围

- 新增 core catalog state owner
  - 新增 `src/core/config/ModelCatalogStateService.ts`
  - 提供 `getCatalogState()`、`applyProviderAvailabilityChange()`、`applyModelAvailabilityChange()`、`probeProvider()`
  - 把 disabled catalog、provider status catalog、disabled placeholder 和 current-enabled 判定从 settings presenter 侧抽回 core
- 收紧 settings/model 消费缝
  - `OpenCodianSettings.addModelSettings()` 现在通过 `ModelCatalogStateService` 拉取 `ModelCatalogState`，并把 provider/model availability 写回委托给 core
  - `SettingsModelCatalogPresenter` 现在只消费 `ModelCatalogState` 的 display/status 视图与 semantic callbacks，保留 presentation state、搜索、accordion 和 probe badge/detail 组装
- 同步 focused tests 与直接相关文档
  - 新增 `tests/unit/core/config/ModelCatalogStateService.test.ts`
  - 精简并更新 `SettingsModelCatalogPresenter` focused tests，保留 presenter 自身 presentation seam 覆盖
  - 更新 core config / settings 直接相关模块文档，以及 roadmap / lane map / 本轮 phase 状态

## 2. 变更文件

- Code
  - `src/core/config/ModelCatalogStateService.ts`
  - `src/core/config/index.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/SettingsModelCatalogPresenter.ts`
- Tests
  - `tests/unit/core/config/ModelCatalogStateService.test.ts`
  - `tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts`
- Docs
  - `docs/modules/core/config/index.md`
  - `docs/modules/core/config/ModelCatalogStateService.md`
  - `docs/modules/core/config/ModelConfigService.md`
  - `docs/modules/features/settings/OpenCodianSettings.md`
  - `docs/modules/features/settings/SettingsModelCatalogPresenter.md`
  - `docs/status/maintainability-lane-map.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-326.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/core/config/ModelCatalogStateService.test.ts tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts`
- `npm test -- tests/unit/core/config/ModelCatalogStateService.test.ts tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
- `npm run build`
- `npm test`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604132043`

## 4. 部署结果

本轮**已执行 Test Vault 部署**，因为改动命中了 deploy-relevant 路径 `src/features/settings/`。

顺序执行并验证：

- 复制 `dist/main.js` 到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
- 复制 `dist/manifest.json` 到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json`
- 复制 `dist/styles.css` 到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css`
- 使用 `rg` 验证已部署的 `main.js` 包含最新 `BUILD_ID` `autopilot-maintainability.202604132043`

## 5. 下一步建议

下一轮应按 roadmap 进入新的 `[NEXT]` 项：`R12 - Maintainability checkpoint`。建议暂停自动拆分，复盘 `OpenCodianView`、`OpenCodianSettings`、`OpenCodeService` 与 core config lane 的 owner 体量变化，确认这一批 queue 在真正降低主 owner 复杂度后，再决定下一轮是否需要新队列。

一句话总结第三百二十六阶段本轮：

> 第三百二十六阶段把 settings/model 目录的 catalog state 组合语义与 availability writeback 收束到新的 `ModelCatalogStateService`，让 presenter 和 settings tab 回到更窄的 UI host / presentation seam。
