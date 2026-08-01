# 可维护性改进：第三百二十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-327.md`
> **推进的 master-plan lane**: P1 `OpenCodianView tab / pane surface`
> **完成的 roadmap queue item**: `R13 - Tab messages pane surface coordinator`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R13 - Tab messages pane surface coordinator`。本轮没有切换到 header/input/selector，也没有回到 P2/P3/P4；只把 `OpenCodianView` 里 messages pane 的 create / activate / remove / clear / scroll metrics / observer cleanup 生命周期迁到一个较厚 owner，并保留现有 `TabManager`、`ConversationViewStateService`、`ScrollManager` 与 tab bridge 的边界。

## 1. 本轮范围

- 新增 `src/features/chat/services/TabMessagesPaneCoordinator.ts`
  - 统一承接 tab messages pane DOM map、observer、scroll metrics、active pane 切换和 pane cleanup
  - 保留 view 侧的 host seam：`messagesContainer` 写回、navigation sidebar rebuild/visibility、scroll policy 与 signal-sync cleanup
- 收缩 `src/features/chat/OpenCodianView.ts`
  - `observeMessagesPaneChildren`、`handleMessagesPaneScroll`、`handleMessagesPaneLayoutChange`、pane create/remove/clear 细节离开主 view
  - `syncPaneScrollMetrics()`、`ensureTabMessagesPane()`、`setActiveMessagesPane()`、`removeTabMessagesPane()`、`clearTabMessagesPanes()` 退化为 coordinator API seam
  - `OpenCodianView.ts` 从 checkpoint 的 **7732 行** 收缩到本轮 build 后的 **7582 行**
- 更新 focused tests 与模块文档
  - 新增 `tests/unit/features/chat/TabMessagesPaneCoordinator.test.ts`
  - `tests/unit/features/chat/backgroundTaskHydrationState.test.ts` 去掉已迁出的 pane-layout 断言，避免继续把 pane lifecycle 细节绑在主 view 私有方法上
  - 新增 `docs/modules/features/chat/services/TabMessagesPaneCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`，说明 tab pane surface ownership 已迁出

## 2. 削弱的 owner 与缩短的链路

- 削弱的 owner：`src/features/chat/OpenCodianView.ts`
  - 主 view 不再直接持有 tab pane map，也不再内联 observer 安装、scroll intent/measurement、pane remove/clear cleanup
- 缩短的主链路：
  - 原链路：`OpenCodianView` → `observeMessagesPaneChildren` / `handleMessagesPaneScroll` / `handleMessagesPaneLayoutChange` / `ensureTabMessagesPane` / `removeTabMessagesPane` / `clearTabMessagesPanes`
  - 现链路：`OpenCodianView` → `TabMessagesPaneCoordinator`
- 刻意没有动的边界：
  - 没有改 `ConversationViewStateService`、`TabViewActivationBridge`、`ConversationHydration*` / `ConversationRenderService`
  - 没有改 P2 question/todo/background-task、P3 composer-context、P4 persisted assistant shell
  - 没有把 `ScrollManager.ts` 回退成 view 内联算法；它仍保持纯 helper

## 3. 验证

- Targeted:
  - `npm test -- --runInBand --runTestsByPath tests/unit/features/chat/TabMessagesPaneCoordinator.test.ts tests/unit/features/chat/backgroundTaskHydrationState.test.ts tests/unit/features/chat/TabActivationRuntimeHostProvider.test.ts tests/unit/features/chat/ConversationHydrationRuntimeHostProvider.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604132130`

## 4. 部署

- 本轮未部署 Test Vault
  - 变更命中 `src/features/chat/**` 与文档路径，未命中 AGENTS 规定的 deploy-relevant runtime/style 路径

## 5. 文件变更

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/TabMessagesPaneCoordinator.ts`
- `tests/unit/features/chat/TabMessagesPaneCoordinator.test.ts`
- `tests/unit/features/chat/backgroundTaskHydrationState.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/TabMessagesPaneCoordinator.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-328.md`

## 6. 下一步建议

下一轮应按 roadmap 推进 `R14 - Header and server status shell presenter`：优先收束 `buildHeader`、server status badge/loop、wordmark/settings button 组装，不要混入 model selector、permission selector 或 composer input。

一句话总结第三百二十八阶段本轮：

> 第三百二十八阶段完成 R13，把 `OpenCodianView` 的 tab messages pane surface lifecycle 收束到 `TabMessagesPaneCoordinator`，让主 view 不再直接管理 pane DOM map 的主要生命周期。
