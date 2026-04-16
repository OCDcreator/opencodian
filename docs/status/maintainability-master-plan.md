# Maintainability Master Plan

> **状态**: [ACTIVE]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R161` 已完成；最后一批 residual thick seam 已收口，当前 `[NEXT]` 为 `R162 - Final high-maintainability checkpoint`。

## 1. 当前判断

当前分支已完成 `R153-R161`，并在本地实测维持 `lint/typecheck/test/build` 全绿：`npm run lint -- --format unix` 为 `0 errors / 0 warnings`，`npm run typecheck` 通过，`npm test` 通过（`282` suites / `1187` tests），`npm run build` 通过。`OpenCodianView` 与 `OpenCodeService` 两个 residual thick owner 已按 queue 完成受控 closeout；当前只剩最终 checkpoint 轮，需要继续保持 `0` 碎片、`0` 错误、`0` 警告、typecheck 全绿、全量测试全过。

本批次的判断是：仍可继续一批，但只剩 checkpoint 复盘，不能重新开 freestyle backlog：

- `src/features/chat/OpenCodianView.ts` 经 `R160` 后约 `4857` 行，`88` 条 import，question post-resolution thin adapter 已并回 `QuestionRuntimeHostAdapter`
- `src/core/opencode/OpenCodeService.ts` 经 `R161` 后约 `1358` 行，`24` 条 import；service-local diagnostics 已并回 `OpenCodeSdkFacade`，session lifecycle 已改为直接接入 SDK session namespace，剩余 seam 需在 `R162` 只做 checkpoint 判断
- `src/features/chat/services/` 的 residual 碎片只能作为并回目标周边证据处理，禁止为了“降主文件行数”再制造薄 helper / adapter / provider / factory
- 本批目标已进入**最终 checkpoint**：复盘两个厚 owner 的 closeout 结果，并判断是否可称为高可维护性并停止 autopilot

如果 `R160-R161` 后仍只剩低收益碎片或需要产品语义重设计才能继续缩小，则 `R162` 必须明确停止，而不是继续制造模块。

## 2. 当前基线

- **lint**: `0 errors / 0 warnings`
- **typecheck**: 通过
- **test**: `282 passed, 282 total` suites / `1187 passed, 1187 total` tests
- **build**: 通过
- **部署策略**: 当前 maintainability 批次不做 Test Vault 部署，除非用户后续明确要求
- **当前 `[NEXT]`**: `R162 - Final high-maintainability checkpoint`

## 3. 本批执行规则

1. 只能按 `R160 -> R161 -> R162` 顺序执行，不能跳题。
2. 每轮都必须运行全量 `npm run lint`、`npm run typecheck`、`npm test` 与 `npm run build`。
3. 当前批次不做 Test Vault 部署，除非用户后续明确要求。
4. `0 碎片` 的含义是：不得新增薄 helper / adapter / provider / factory；若遇到薄层，优先并回相邻厚 owner，禁止回灌到 `OpenCodianView.ts` / `OpenCodeService.ts` 主文件本体。
5. `OpenCodianView` / `OpenCodeService` 的改动必须带来可量化的 line count、import surface 或 direct assembly surface 下降；不能只把体量平移到更多小文件。
6. 若候选改动会削弱语义、删断言、降覆盖、暴露 experimental demo 或破坏 SDK-first / legacy fallback，则必须停止并写明阻塞。

## 4. 回归观察点

1. `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归。
2. chat services：question/todo/background-task runtime、tab activation、authoritative sync、context usage、model/permission/input panel 语义不回归。
3. `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、managed server adoption/restart、sync-event bridge 与 final response completion 语义不回归。
4. tests / glass / demo：opt-in glass 行为、demo 不进入 stable UI path、heavy suites 覆盖语义不回归。

## 5. 高可维护性判定

若 `R160-R162` 后仍保持 `lint 0/0`、`typecheck` 通过、全量测试通过、build 通过，并且两个 residual thick owner 的 direct assembly surface 均明显下降、没有新薄碎片，则可以把当前分支判断为“高可维护性，可暂停 autopilot，转回人工 review / 功能开发”。

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`
