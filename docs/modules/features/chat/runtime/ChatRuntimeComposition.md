# ChatRuntimeComposition

> 2026-08-01: 新增模块。Task 15 把 `OpenCodianView` 的四个 `create*RuntimeWiring()` 编排方法 + 构造器内联的 identity/render 装配 + `createSendPipelineHostDependencies` 全部迁出，集中到这个 composition owner。这是 Agent-Friendly Architecture Refactor Phase 4 的核心产物。
> **Inventory (APPROVED, codex/terra 4 轮审查)**: `docs/superpowers/plans/task15-chat-runtime-composition-inventory.md`

> **源码**: `src/features/chat/runtime/ChatRuntimeComposition.ts`
> **状态**: [REVIEW]

## 概述

`ChatRuntimeComposition` 是聊天 runtime 的 composition owner。它在 `OpenCodianView` 构造时被实例化一次，通过 `compose()` 按既定阶段顺序（surface → identity/render → background → conversation → interaction）装配全部 chat runtime coordinator，返回单个 `ChatRuntime` 结构体，由 view 解构到既有的私有字段。

关键不变量（characterization 测试 + inventory §2.2c 锁定）：

- **从不引用 `OpenCodianView` 类**。view 仅作为结构化的 `ChatRuntimeCompositionHost` 传入（按 shape 满足），杜绝 god-object 泄漏。
- `assembleConversationTabRuntime` 只接收窄化的 `TabRuntimeViewSource`（view 通过 `tabRuntimeViewSource` getter 显式暴露），而非整个 view。
- 返回结构体；view 不按 key/type 检索服务（非 service locator）。
- **不拥有 disposal**。`OpenCodianView.onClose` 按 inventory §4 文档化的 26 步顺序销毁解构后的字段；本 owner 只负责构造。

## 跨阶段值流动

- 早期阶段构建、晚期阶段消费的 coordinator 通过 `compose()` 局部变量传递（如 `conversationRenderService`、`composerContextViewFacade`、`tabMessagesPaneCoordinator`、`userMessageContentRenderer`、`sessionTodoCoordinator`）。
- 懒读取的 view 状态（compose 完成后才被 view 解构赋值的字段）通过 `host.X` 读取，使其在闭包被调用时 live 解析。
- `buildSendPipelineHostDependencies` 中被同步调用的 `createSendPipelineShellPort` 读取 surface 构建的 `assistantShellViewHostAdapter`（非 `host.X`），因为它在 `SendPipelineRuntime` 构造期间就被调用，早于 view 解构。

## 依赖方向

owner: `feature.chat-runtime`（layer features）。依赖 `feature.chat`（services/runtime/ui）+ `core.opencode` + `core.agents` + `shared`。无反向依赖；不依赖 `src/app` 或 `src/main.ts`。

## 相关

- 装配的 coordinator 列表见 inventory §2（surface 17、background 4、conversation ~14、interaction 8）。
- disposal 顺序契约见 inventory §4。
