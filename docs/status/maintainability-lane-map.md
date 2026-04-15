# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [READY] `R86` 已完成，当前首个 `[NEXT]` 为 `R87 - Maintainability checkpoint`。

## 当前优先级

- **当前 `[NEXT]`**：`R87 - Maintainability checkpoint`
- **本批目标**：复盘 `R68-R86` 的 owner 收益、warning 变化、验证成本与后续建议
- **当前 lint 基线**：`0 errors / 64 warnings`
- **热点顺序**：
  1. `docs/status/maintainability-master-plan.md`
  2. `docs/status/maintainability-round-roadmap.md`
  3. `docs/status/maintainability-lane-map.md`
  4. 最新 lint / test / build 输出与 phase 文档

## 本批边界

- 不自动 freestyle；autopilot 只能按 `R68 -> R87` 顺序推进
- 不新增薄 helper / adapter / provider / factory；新 owner 必须覆盖完整 section / lifecycle / runtime seam
- 抽出的独立模块如果明显过薄，优先并回调用方，不为了“看起来更模块化”保留碎片
- 不回切 settings residual，除非后续 checkpoint 明确显示 chat / opencode 被正确性或验证成本阻塞
- heavy tests 的拆分只允许按责任域收口，不允许为了降 warning 去篡改 runtime 覆盖语义
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验
- 恢复运行必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`

## 回归观察点

- `OpenCodianView`：并发 tab/session streaming、hydration/auth-sync gate、background-task completion notice、scroll restore、question card resolution 不回归
- chat services：background-task timeline、model selection、input panel theme、session todo stale notice、question dock 行为不变
- `OpenCodeService` / streaming：SDK-first / legacy fallback、session-scoped abort/detach、final response completion、sync-event bridge 语义不变
- tests：拆分 heavy suites 时保留原有 coverage 断言，不用“删断言”换低 warning
- lint：整批都必须维持 `0 errors`

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-420.md`
- 最近 checkpoint：`docs/status/maintainability-phase-402.md`
