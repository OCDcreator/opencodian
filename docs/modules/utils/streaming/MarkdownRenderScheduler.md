# Markdown Render Scheduler

> **源码**: `src/utils/streaming/MarkdownRenderScheduler.ts`
> **状态**: [REVIEW]

## 概述

`MarkdownRenderScheduler` 把流式 markdown 重渲染合并进统一帧预算：流式文本（`StreamController`）、thinking block 与 pseudo-stream reveal 都在渲染累积 markdown，限制重绘频率可以避免长消息、代码块和公式在每个 chunk 到达时都整段重排。

模块同时导出共享常量 `STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS = 96`，供所有流式渲染路径复用同一个间隔预算。

## 核心逻辑

### 帧预算合并

- 每个间隔最多渲染一次
- idle 后的首次 `schedule()` 走 leading-edge 即时渲染（`lastRenderAt === 0` 时 delay 为 0）
- 间隔内的多次 `schedule()` 合并成一次 trailing 渲染
- render 回调在渲染时才读取最新累积内容，因此合并窗口内不会渲染过期或中间态

### schedule()

- 只置 `requested` 标记；已有 timer 或 in-flight 渲染时直接返回，由 trailing 渲染携带最新内容
- delay 按 `minIntervalMs - (now - lastRenderAt)` 计算，保证距上次渲染至少一个间隔

### flush()

- 清掉 pending timer 并等待 in-flight 渲染 settle；仅当存在未处理请求或 in-flight 边界时渲染最新内容。`cancel()` 后的 `flush()` 不会再写入已脱离的 render target
- 用于流结束边界：最终内容必须先上屏再继续后续收尾
- 与 scheduled 渲染不同，`flush()` 会把渲染错误抛给调用方

### cancel()

- 丢弃 pending 渲染（例如 teardown / abort）；已 in-flight 的渲染会继续完成

### 错误语义

- scheduled 渲染是 best-effort：失败会被吞掉，不会成为 timer 里的未处理 rejection

## 关键方法

| 方法 | 说明 |
|------|------|
| `schedule()` | 请求一次渲染，合并进帧预算 |
| `flush()` | 清 timer、等 in-flight，并在未取消的有效请求边界渲染最新内容 |
| `cancel()` | 丢弃 pending 渲染，in-flight 继续完成 |

## 与其他模块的交互

- `StreamController`：复用 `STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS` 常量，不再私有定义
- `ThinkingBlockRenderer`：按 `ThinkingBlockState` 经 WeakMap 持有 scheduler，`appendContent()` 走 `schedule()`
- `ConversationRenderRuntime`：synced assistant pseudo-stream reveal 的 chunk 渲染经 scheduler 帧预算调度

## 注意事项

- 调度器不持有内容本身；调用方必须把"读取最新累积内容"闭包进 render 回调
- `flush()` 会更新 `lastRenderAt`，因此流结束后的首次 `schedule()` 仍受间隔约束
