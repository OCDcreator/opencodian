# Maintainability Master Plan

> **状态**: [PAUSED]
> **作用**: 这是 maintainability 无人值守的战略文档。每轮开始前，先读本文件，再读 `docs/status/maintainability-round-roadmap.md` 与最近的 `docs/status/maintainability-phase-XXX.md`。
> **自动推进状态**: `R162` checkpoint 已完成；当前没有可自动执行的后续任务，maintainability autopilot 暂停等待人工续排。

## 1. 当前判断

当前分支已完成 `R153-R162`，并在本地实测维持 `lint/typecheck/test/build` 全绿：`npm run lint -- --format unix` 为 `0 errors / 0 warnings`，`npm run typecheck` 通过，`npm test` 通过（`282` suites / `1187` tests），`npm run build` 通过。`R162` checkpoint 已确认 `OpenCodianView` 与 `OpenCodeService` 两个 residual thick owner 的最后一批 queue closeout 收益成立，当前分支满足“高可维护性”停机条件。

当前判断是：queue 已自然耗尽，应暂停 autopilot，而不是再自动制造新 backlog：

- `src/features/chat/OpenCodianView.ts` 维持在约 `4857` 行、`88` 条 import；`R160` 已把 question post-resolution 薄 adapter 并回 `QuestionRuntimeHostAdapter`，相邻 chat owner 维持在 `236-381` 行区间，没有新增 sub-100 行薄碎片。
- `src/core/opencode/OpenCodeService.ts` 维持在约 `1358` 行、`24` 条 import；`R161` 已把 service-local diagnostics 并回 `OpenCodeSdkFacade`，并改为直接接入 `sdk.session` lifecycle，相邻 opencode owner 维持在 `236-611` 行区间，没有新增薄 facade / gateway / provider。
- 剩余热点仍是两个厚 owner 本体，但进一步缩减已不再属于 queue 中的“收掉最后薄 seam”工作，而更像需要产品语义重设计或人工续排的新 lane。
- 结论：当前分支达到**高可维护性 checkpoint**，应停回人工 review / 功能开发；若未来还要继续压缩，必须先人工续排新 queue。

## 2. 当前基线

- **lint**: `0 errors / 0 warnings`
- **typecheck**: 通过
- **test**: `282 passed, 282 total` suites / `1187 passed, 1187 total` tests
- **build**: 通过
- **部署策略**: 当前 maintainability 批次不做 Test Vault 部署，除非用户后续明确要求
- **当前 `[NEXT]`**: 当前没有可自动执行的后续任务

## 3. 本批执行规则

1. 当前 queue 已在 `R162` 关闭；没有人工续排前，不自动开启 `R163+`。
2. 若未来恢复 maintainability，仍必须运行全量 `npm run lint`、`npm run typecheck`、`npm test` 与 `npm run build`。
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

`R160-R162` 已在 `lint 0/0`、`typecheck` 通过、全量测试通过、build 通过的前提下完成，并且两个 residual thick owner 的 direct assembly surface 均已较 checkpoint 前明显下降、没有新薄碎片；当前分支可判断为“高可维护性，可暂停 autopilot，转回人工 review / 功能开发”。

## 6. 阅读顺序

1. `AGENTS.md`
2. `docs/status/maintainability-master-plan.md`
3. `docs/status/maintainability-round-roadmap.md`
4. 最近的 `docs/status/maintainability-phase-XXX.md`
5. 如需历史上下文，再读 `docs/status/maintainability-completed-batches.md`
