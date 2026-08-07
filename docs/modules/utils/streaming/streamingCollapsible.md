# Streaming Collapsible Lifecycle

> **源码**: `src/utils/streaming/streamingCollapsible.ts`

为流式 thinking/tool 卡片登记轻量 collapsible 的 disposer。聊天消息重建或清除时，`disposeCollapsiblesWithin()` 会调用 `disposeStreamingCollapsiblesWithin()`，移除这些卡片自己的 header listeners，避免旧 DOM 子树保留交互闭包。

`registerStreamingCollapsible()` 对同一 wrapper 的重复登记会先释放旧 disposer；每个 disposer 幂等。该模块只管理生命周期，不改变展开/折叠状态或渲染策略。
