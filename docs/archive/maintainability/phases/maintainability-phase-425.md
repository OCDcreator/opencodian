# 可维护性改进：第四百二十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-424.md`
> **推进的 master-plan lane**: Maintainability / chat rendering
> **完成的 roadmap queue item**: `R90 - OpenCodianView message render/update residual seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项：`R90 - OpenCodianView message render/update residual seam`。范围限定在 `OpenCodianView` 的 render/update 残余装配、现有 `ConversationRenderService` owner 与直接相关测试/状态文档，不扩展到 send/composer、tail patch 新语义或其他 lane。

## 1. 本轮范围

- 把 `OpenCodianView` 中供 conversation sync、hydration、authoritative sync、message finalization 与 send preparation 复用的 message render/update 直通装配改为直接注入现有 `ConversationRenderService`。
- 删除 `OpenCodianView` 里仅转调 `ConversationRenderService` 的 `renderMessage`、`renderMessages`、`rerenderSingleUserMessage`、`rerenderConversationMessages`、`patchTrailingAssistantRender` 与 `applySyncedConversationUpdate` 薄方法。
- 更新直接相关的 `turnDiffNoticeRouting` 测试，使其观察实际 notice render owner，而不是已移除的 view 级 pass-through。
- 同步更新 maintainability 状态文档，反映 `R90` 完成与 `R91` 接棒。

## 2. 本轮结果

- `OpenCodianView` 现在在构造阶段先创建单一 `ConversationRenderService`，再把该 owner 直接接入 conversation sync load、hydration、authoritative sync、message finalization 与 send-preparation host wiring。
- message render/update 的 persisted-message apply、incremental follow-up 与 rerender fallback 不再经过 view 内部的重复 pass-through，`OpenCodianView` 对这些残余 seam 的直控继续收缩。
- `turnDiffNoticeRouting` 覆盖已改为直接观察 `assistantShellViewHostAdapter.renderPersistedAssistantMessage()`，与 notice 真正的渲染路径保持一致。
- 未改变 assistant tail patch、question card resolution、background-task timeline 呈现、hydration/auth-sync gate 或并发 tab/session streaming 语义。

## 3. 队列推进

- `docs/status/maintainability-round-roadmap.md` 已将 `R90` 标记为 `[DONE]`。
- 下一项 `R91 - OpenCodianView send/composer interaction seam` 已提升为新的 `[NEXT]`。
- `docs/status/maintainability-master-plan.md` 与 `docs/status/maintainability-lane-map.md` 已同步更新当前 `[NEXT]` 与最近验证状态。

## 4. 验证

- `npm test -- ConversationRenderService`
- `npm test -- turnDiffNoticeRouting`
- `npm test`
- `npm run build`

验证结果：

- `npm test -- ConversationRenderService`：通过，`2` 个 suites / `21` 个 tests 全部通过
- `npm test -- turnDiffNoticeRouting`：通过，`1` 个 suite / `1` 个 test 全部通过
- `npm test`：通过，`277 passed, 277 total` suites；`1149 passed, 1149 total` tests；用时 `4.952 s`
- `npm run build`：通过，`BUILD_ID` 为 `autopilot-maintainability.202604152019`

## 5. 部署

- 本轮修改了 chat runtime、测试与 maintainability 状态文档，但未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署；最近一次已验证部署仍为 `R64` 的 `autopilot-maintainability.202604150602`。

## 6. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/turnDiffNoticeRouting.test.ts`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-425.md`

## 7. 下一步

- 下一推荐切片：`R91 - OpenCodianView send/composer interaction seam`
- 继续优先把 send action、composer draft/runtime context 与 submit follow-up 从 `OpenCodianView` 收束到现有 composer/send owner，避免切换到其他 lane。

一句话总结第四百二十五阶段本轮：

> 第四百二十五阶段完成 `R90`，把 `OpenCodianView` 中 message render/update 的残余直通装配收束为直接注入现有 `ConversationRenderService`，并把队列顺序推进到 `R91`。
