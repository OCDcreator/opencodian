# 可维护性改进：第四百六十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-460.md`
> **推进的 master-plan lane**: Maintainability / plugin startup
> **完成的 roadmap queue item**: `R126 - main.ts residual startup normalization seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R126 - main.ts residual startup normalization seam`。范围限定在 `main.ts` 的 startup preload/runtime/registration orchestration、loaded-settings bootstrap persist 判定、对应 focused `main` 测试，以及本轮 maintainability 状态文档；没有提前进入 `R127` 的 checkpoint，也没有扩散到 `docs/modules/**`。

## 1. 本轮范围

- 将 `src/main.ts` 的 `onload()` 收束为更清晰的三段式启动顺序：`prepareStartupState()`、`bootstrapOpenCodeRuntime()` 与 `registerWorkspaceIntegration()`。
- 将 startup follow-up side effects（glass adapter、logger、provider icon mode、locale）集中到 `applyLoadedSettingsStartupEffects()`，保持 settings preload 与 locale/theme startup 语义不变。
- 将 vault-scoped OpenCode wiring、local auto-start 与 workspace registration 分别收束到 owner helper，保留 conversation preload 必须先于 view restore/registration 的顺序。
- 将 loaded settings 的 merge/normalize/persist 判定集中到 `prepareLoadedSettingsBootstrapState()`，让 `loadSettings()` 只负责应用结果、报告恢复状态并在需要时持久化迁移。
- 扩充 `tests/unit/main.test.ts`，新增 `onload()` orchestration focused 覆盖，并补上测试环境 `BUILD_ID`。

## 2. 代码收束结果

- `OpenCodianPlugin.onload()` 不再直接铺开 storage init、settings effects、runtime bootstrap 与 view/command/settings registration 细节，只负责串联三个厚 startup 阶段。
- `prepareStartupState()` 现在统一处理 storage 初始化、settings 加载与 startup UI/locale follow-up，减少 bootstrap 前散落的 side effects。
- `bootstrapOpenCodeRuntime()` 现在统一处理 OpenCode config 初始化、service 创建、vault-scoped config/model service wiring、auto-start 尝试、server snapshot 与 conversation preload。
- `loadSettings()` 现在通过 `prepareLoadedSettingsBootstrapState()` 统一决定是否因 split persistence、legacy local port migration 或 glass defaults migration 触发回写，避免 method 内重复拼接条件。

## 3. 验证

- `npm test -- tests/unit/main.test.ts tests/unit/main/themeSettingsMigration.test.ts`
- `npm test`
- `BUILD_ID=autopilot-maintainability.$(date +%Y%m%d%H%M) npm run build`

验证结果：

- focused suites：通过，`29 passed, 29 total`
- `npm test`：通过，`276 passed, 276 total` suites；`1184 passed, 1184 total` tests；用时 `2.645 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604160258`

## 4. 部署

- 本轮命中 deploy-relevant 路径 `src/main.ts`，因此在 build 成功后执行 Test Vault 部署。
- 已顺序复制 `dist/main.js`、`dist/manifest.json` 与 `dist/styles.css` 到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`。
- 已验证 Test Vault `main.js` 包含最新 `BUILD_ID`：`autopilot-maintainability.202604160258`。

## 5. 文件变更

- `src/main.ts`
- `tests/unit/main.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-461.md`

## 6. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R126` 标记为 `[DONE]`。
- 下一项 `R127 - Checkpoint after settings/main seams` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步刷新当前 `[NEXT]`、最近验证与最近部署信息。

## 7. 下一步

- 下一推荐切片：`R127 - Checkpoint after settings/main seams`
- 从 `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-round-roadmap.md` 入手，复盘 R123-R126 的 settings/main residual 收益，并为 Batch 9 heavy test split wave 做入口检查。

一句话总结第四百六十一阶段本轮：

> 第四百六十一阶段完成 `R126`，把 `main.ts` 的 startup preload/runtime/registration orchestration 与 loaded-settings persist 判定进一步收束到更清晰的 owner seam，并将 queue 顺序推进到 `R127` 的 settings/main checkpoint。
