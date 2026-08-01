# 可维护性改进：第四百零五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-404.md`
> **推进的 master-plan lane**: Maintainability / chat render update
> **完成的 roadmap queue item**: `R70 - OpenCodianView message render/update seam`

本轮严格执行 roadmap 的首个 `[NEXT]` 项 `R70 - OpenCodianView message render/update seam`，把 `OpenCodianView` 里残留的消息 render/update orchestration 收束回既有 `ConversationRenderService`；没有混入 send pipeline、tab lifecycle、question dock 或 opencode stream transform 改动。

## 1. 本轮范围

- 扩展 `src/features/chat/services/ConversationRenderService.ts`，让它统一承接 persisted message render、empty-rewind notice、single-user rerender、pseudo-stream reveal、append-only synced update 与既有 full rerender / tail patch 流程。
- 将 `src/features/chat/OpenCodianView.ts` 的 `renderMessage()`、`renderMessages()`、single-user rerender 与 pseudo-stream/update 壳层改为委托给 render service，并补充 assistant shell render host port 与 user frame/footer host seam。
- 更新直接相关 render 单测，覆盖 empty notice、single-user rerender 与 render-service-owned pseudo-stream/message append 路径。
- 更新直接相关模块文档与 maintainability 路线文档，把 `R70` 标记完成并将 `R71` 提升为新的 `[NEXT]`。

## 2. 结果

- `OpenCodianView` 不再直接铺开 persisted assistant/user message render、empty conversation notice、single-user body rerender 与 pseudo-stream reveal 这组 render/update orchestration。
- `ConversationRenderService` 现在作为消息 render/update 的主 owner，统一组合 assistant shell render port、user frame/footer host、markdown host 与既有 assistant-tail patch/runtime host。
- 既有语义保持不变：structured content blocks、assistant footer/copy content、pseudo-stream reveal、empty-rewind notice，以及 tail patch fallback / hydration scroll restore 都沿用原逻辑。

## 3. 验证

- Focused: `npm test -- ConversationRenderService ConversationAuthoritativeSyncCoordinator MessageSendPreparationService ConversationHydrationRuntimeHostProvider`
- Full: `npm test`
- Build: `npm run build`

验证结果：

- focused render 相关 suites 通过，`4 passed, 4 total` suites；`32 passed, 32 total` tests
- `npm test` 通过，`266 passed, 266 total` suites；`1137 passed, 1137 total` tests
- `npm run build` 通过，`BUILD_ID` 为 `autopilot-maintainability.202604151403`

## 4. 部署

- 本轮变更命中 `src/features/chat/**`、tests 与 docs，未命中仓库约定的 Test Vault 强制部署路径。
- 未执行 Test Vault 部署。

## 5. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationRenderService.ts`
- `tests/unit/features/chat/ConversationRenderService.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-405.md`

## 6. 队列推进

- `R70 - OpenCodianView message render/update seam` 已标记为 `[DONE]`
- `R71 - ConversationRenderService assistant/body render seam` 已提升为新的 `[NEXT]`

## 7. 下一步

- 下一推荐切片：`R71 - ConversationRenderService assistant/body render seam`
- 优先从 `ConversationRenderService.ts` 继续收束 assistant shell/body patch、content-block dispatch 与 synced update apply，不混入 background-task timeline 或 question dock 改动。

一句话总结第四百零五阶段本轮：

> 第四百零五阶段完成 `R70`，把 `OpenCodianView` 的消息 render/update orchestration 收束回 `ConversationRenderService`，并把 roadmap 的首个 `[NEXT]` 推进到 `R71`。
