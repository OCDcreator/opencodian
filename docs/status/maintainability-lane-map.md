# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [READY] `R65` Warning cleanup batch B (config and opencode core) 已完成；当前首个 `[NEXT]` 为 `R66 - Warning cleanup batch C (server, icons, and heavy tests)`。

## 当前优先级

- **当前 `[NEXT]`**：`R66 - Warning cleanup batch C (server, icons, and heavy tests)`
- **本批目标**：保持 `0 errors`，config/opencode core warning batch B 已完成，继续推进 server/icon/heavy-tests warning cleanup 与 checkpoint
- **当前 lint 基线**：`0 errors / 84 warnings`
- **热点顺序**：
  1. `src/core/opencode/ServerManager.ts`
  2. `src/utils/icons/ProviderIconService.ts`
  3. `tests/unit/core/opencode/ServerManager.test.ts`
  4. `tests/unit/utils/icons/ProviderIconService.test.ts`

## 本批边界

- 不直接恢复 freestyle；autopilot 只能按 `R50 -> R67` 顺序推进
- 不新增薄 helper / adapter / provider / factory；新 owner 必须覆盖完整 section / lifecycle / runtime seam
- 抽出的独立模块如果明显过薄，优先并回调用方，不为了“看起来更模块化”保留碎片
- `OpenCodianSettings` 的 UI/debug 残余 section 已完成；user section 暂不单独拆成薄 owner
- `OpenCodeService` / `OpenCodianView` 本批不再自由回切；只有 roadmap 明确写出的服务热点允许继续推进
- 命中 deploy-relevant paths 时，继续严格执行 build → Test Vault deploy → `BUILD_ID` 校验
- 恢复运行必须使用外部 profile `/Users/dht/.config/opencodian/mac-autopilot-profile.json`

## 回归观察点

- `OpenCodianSettings`：title model follow-current、question card refresh、plugin snapshot/OMO 管理、tab layout、debug export/path picker 语义不回归
- `ServerManager`：managed local `4096` adoption/restart、launch tail、shutdown / restart / adopted pid teardown 语义不变
- `ModelConfigService`：`baseEffective` / `effective` 区分、provider enable/disable layering、default model resolution 不回归
- `OpenCodeMessageNormalizationMapper`：tool status / result transform、context attachment path normalization、OMO normalization 语义不回归
- `ProviderIconService`：builtin/LobeHub/custom fallback、cache path、mime detection、preview fallback 语义不变
- lint：`R50` 已把基线恢复到 `0 errors`，后续所有轮次都不得重新引入 error

## 历史入口

- 批次归档：`docs/status/maintainability-completed-batches.md`
- 最近成功 phase：`docs/status/maintainability-phase-400.md`
- 停机线索：`automation/runtime/stop-after-next-commit.log` 与 `automation/runtime/history.jsonl` 中 round `398` 记录
