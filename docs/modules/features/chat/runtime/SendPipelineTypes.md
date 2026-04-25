# SendPipelineTypes

> **源码**: `src/features/chat/runtime/SendPipelineTypes.ts`
> **状态**: [REVIEW]

## 概述

`SendPipelineTypes` 是发送 runtime 子目录的共享契约层。它把原先散落在 `OpenCodianView`、`SendPipelineRuntime` 与测试里的匿名结构收拢成稳定类型，方便把发送链路继续拆到更细粒度的模块。

## 关键类型

- `SendPipelineTabRuntime`：发送链路真正需要读写的 tab 级 streaming 状态切片
- `SendPipelineStreamController` / `SendPipelineStreamElements`：stream shell 与流式渲染控制器边界
- `SendPipelinePreparationPort` / `SendPipelineFinalizationPort`：对 `MessageSendPreparationService` 与 `MessageFinalizationService` 的窄接口
- `SendPipelineViewPort` / `SendPipelineTransportPort` / `SendPipelineShellPort` / `SendPipelinePersistencePort` / `SendPipelineDebugPort`：把发送 host 面按职责拆开的窄 port；其中 transport port 现在显式接收 preparation 阶段生成的稳定 `messageID` / `requestParts`，并支持可选 top-level `agent`，shell port 只保留 streaming shell 创建、reveal、notice placeholder 渲染与 timestamp 收尾，并由 `AssistantShellRenderer.ts` 统一实现 shell adapter
- `SendPipelineHost`：由上述 port 组合出来的完整宿主契约，方便 view 侧一次性装配
- `SendPipelineExecutionHost` / `StreamChunkRouterHost` / `StreamLocalFinalizerHost`：runtime、router 与本地收尾各自真正依赖的 host 子集
- `SendPipelineTraceState`：chunk router 汇总出来的流状态快照
- `StreamChunkRouterOptions` / `StreamChunkRouterResult`：stream 消费阶段输入输出
- `LocalStreamOutcome` / `StreamLocalFinalizerOptions` / `StreamLocalFinalizerResult`：本地收尾阶段输入输出

## 设计目的

- 让 `SendPipelineRuntime` 只装配依赖，不再内联庞大的匿名对象类型
- 让 `StreamChunkRouter`、`StreamLocalFinalizer` 与更小的 helper 模块共享同一套状态形状
- 让 send preparation 生成的 stable `messageID + parts[]` 以及可选显式 main `agent` 能通过类型层明确传到 transport，而不是再次退回匿名字段
- 让发送链路里的每个子模块只声明自己真正需要的 host port，避免 `SendPipelineHost` 继续膨胀成新的隐形大接口
- 让单测可以只 mock 必需能力，而不是构造整个 `OpenCodianView`

## 注意事项

- `SendPipelineHost` 仍然只是内部协作契约，不是插件对外 API。
- 新增 host 能力时，优先先判断它属于 view / transport / shell / persistence / debug 哪个 port，再决定是否真的需要扩张完整 `SendPipelineHost`。
- 纯 notice message 构造优先放在 `AssistantNoticeRenderer.ts` 这类 helper，而不是继续塞回 shell port。
- 新的发送 helper 应优先扩展这里的类型，而不是继续在实现文件里发散匿名结构。
- `SendPipelineTabRuntime` 只收录发送链路真正关心的字段；不要把整个 view runtime 状态无差别搬进来。
