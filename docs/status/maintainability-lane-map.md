# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [PAUSED] `R67` Maintainability and warning checkpoint 已完成；当前没有可自动执行的 `[NEXT]`，等待人工续排 queue。

## 当前优先级

- **当前 `[NEXT]`**：`当前没有可自动执行的 [NEXT]`
- **本批结论**：`R50-R66` 的 owner 收益与 warning cleanup 已在 `R67` checkpoint 中完成复盘，warning 基线已进入 `79`，当前应等待人工决定下一批路线
- **当前 lint 基线**：`0 errors / 79 warnings`
- **若人工续排，建议热点顺序**：
  1. `src/features/chat/OpenCodianView.ts` 与 `src/features/chat/services/`
  2. `src/core/opencode/OpenCodeService.ts` 与 `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  3. `src/features/settings/SettingsStyleSection.ts`、`src/features/settings/SettingsModelSection.ts` 与 `src/features/settings/ModelConfigModal.ts`
  4. `src/utils/glass/adapters/` 与相关 demo/tests（低优先级、保持 defer）

## 本批边界

- 不自动扩展 `R68+`；如需恢复 autopilot，必须先人工补充新的 `[QUEUED]`
- 不新增薄 helper / adapter / provider / factory；新 owner 必须覆盖完整 section / lifecycle / runtime seam
- 抽出的独立模块如果明显过薄，优先并回调用方，不为了“看起来更模块化”保留碎片
- `OpenCodianSettings` 的 UI/debug 残余 section 已完成；user section 暂不单独拆成薄 owner
- `OpenCodeService` / `OpenCodianView` 仍不能 freestyle 拆分；只有人工续排进 roadmap 的服务热点才能继续推进
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
- 最近成功 phase：`docs/status/maintainability-phase-402.md`
- 停机线索：`automation/runtime/stop-after-next-commit.log` 与 `automation/runtime/history.jsonl` 中 round `398` 记录
