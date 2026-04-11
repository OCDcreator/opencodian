# SendPipelineTypes

> **源码**: `src/features/chat/runtime/SendPipelineTypes.ts`
> **状态**: [REVIEW]

## 概述

`SendPipelineTypes` 是发送 runtime 子目录的共享契约层。它把原先散落在 `OpenCodianView`、`SendPipelineRuntime` 与测试里的匿名结构收拢成稳定类型，方便把发送链路继续拆到更细粒度的模块。

## 关键类型

- `SendPipelineTabRuntime`：发送链路真正需要读写的 tab 级 streaming 状态切片
- `SendPipelineStreamController` / `SendPipelineStreamElements`：stream shell 与流式渲染控制器边界
- `SendPipelinePreparationPort` / `SendPipelineFinalizationPort`：对 `MessageSendPreparationService` 与 `MessageFinalizationService` 的窄接口
- `SendPipelineHost`：runtime 子系统回调回 `OpenCodianView` 的唯一宿主契约
- `SendPipelineTraceState`：chunk router 汇总出来的流状态快照
- `StreamChunkRouterOptions` / `StreamChunkRouterResult`：stream 消费阶段输入输出
- `LocalStreamOutcome` / `StreamLocalFinalizerOptions` / `StreamLocalFinalizerResult`：本地收尾阶段输入输出

## 设计目的

- 让 `SendPipelineRuntime` 只装配依赖，不再内联庞大的匿名对象类型
- 让 `StreamChunkRouter`、`StreamLocalFinalizer` 与更小的 helper 模块共享同一套状态形状
- 让单测可以只 mock 必需能力，而不是构造整个 `OpenCodianView`

## 注意事项

- `SendPipelineHost` 是内部协作契约，不是插件对外 API。
- 新的发送 helper 应优先扩展这里的类型，而不是继续在实现文件里发散匿名结构。
- `SendPipelineTabRuntime` 只收录发送链路真正关心的字段；不要把整个 view runtime 状态无差别搬进来。
