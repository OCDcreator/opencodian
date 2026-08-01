# 可维护性改进：第八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-7.md`

本轮继续沿着第七阶段的发送子系统边界推进，但只做了一个切口：**把 `createSendPipelineRuntimeHost()` 的宿主面拆成更窄的 port，并让发送 runtime 子模块改为依赖各自真正需要的 host 子集**。本轮没有同时搬运 assistant shell / notice rendering ownership，也没有开启新的大拆分。

## 1. 本轮范围

本轮只处理发送链路的 host surface 拆分：

- 在 `src/features/chat/runtime/SendPipelineTypes.ts` 中新增：
  - `SendPipelineViewPort`
  - `SendPipelineTransportPort`
  - `SendPipelineShellPort`
  - `SendPipelinePersistencePort`
  - `SendPipelineDebugPort`
- 基于这些 port 再组合出：
  - `SendPipelineHost`
  - `SendPipelineExecutionHost`
  - `StreamChunkRouterHost`
  - `StreamLocalFinalizerHost`
  - 以及 pending / trace / shell finalizer / local persistence 等更窄 host 子集
- `OpenCodianView.createSendPipelineRuntimeHost()` 不再直接内联一整块匿名对象，而是先按上述 port 分组再组合返回
- `PendingIndicatorController`、`SendPipelineTrace`、`StreamChunkRouter`、`buildLocalStreamOutcome`、`StreamShellFinalizer`、`LocalStreamMessagePersistence` 等模块改为声明更窄的 host 依赖

这一步的收益是：发送 runtime 目录下的子模块不再默认面向完整 `SendPipelineHost`，后续继续抽离 assistant shell / notice ownership 时，边界已经提前压薄。

## 2. 变更文件

- `src/features/chat/runtime/SendPipelineTypes.ts`
- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `src/features/chat/runtime/PendingIndicatorController.ts`
- `src/features/chat/runtime/SendPipelineTrace.ts`
- `src/features/chat/runtime/StreamChunkRouter.ts`
- `src/features/chat/runtime/buildLocalStreamOutcome.ts`
- `src/features/chat/runtime/StreamShellFinalizer.ts`
- `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
- `src/features/chat/OpenCodianView.ts`
- `docs/modules/features/chat/runtime/SendPipelineTypes.md`
- `docs/modules/features/chat/runtime/SendPipelineRuntime.md`
- `docs/modules/features/chat/OpenCodianView.md`

## 3. 验证

本轮实际执行并通过：

- `npm test`
- `npm run build`

其中 build 首次执行时因为本地缺少 `reference-projects/three.js` 构建输入而失败；本轮仅为完成验证临时补齐本地输入后重跑 build，通过后未把该临时修复纳入提交。

## 4. 部署结果

`npm run build` 成功后，已按仓库约定顺序部署：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604111732`

## 5. 下一步建议

下一轮最推荐继续利用本轮刚建立的 `SendPipelineShellPort` 边界，**真正把 assistant shell / notice rendering ownership 从 `OpenCodianView` 挪到独立 renderer / adapter 模块**，优先处理这些方法：

- `createAssistantMessageElement()`
- `revealStreamingAssistantMessageElement()`
- `addTimestampWithCopyButton()`
- `buildStreamErrorNotice()`
- `buildInterruptedAssistantNotice()`
- `renderAssistantPlaceholderAsNotice()`

一句话总结第八阶段本轮：

> 第七阶段已经把发送子系统搬出 `OpenCodianView`；第八阶段本轮先把宿主面切成更窄的 port，为下一轮继续外移 assistant shell / notice ownership 提前铺好边界。
