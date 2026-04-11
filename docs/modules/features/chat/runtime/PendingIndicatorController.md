# PendingIndicatorController

> **源码**: `src/features/chat/runtime/PendingIndicatorController.ts`
> **状态**: [REVIEW]

## 概述

`PendingIndicatorController` 专门管理发送链路里那条“1 秒后才显示”的 pending 指示器。它把延迟出现、随机文案、计时器刷新、revealed scroll 和清理逻辑从 `StreamChunkRouter` 中进一步拆开。

## 公开接口

```typescript
export class PendingIndicatorController {
  get message(): string;
  get isVisible(): boolean;
  schedule(runtime, onShown): void;
  clear(clearDelay?: boolean): void;
}
```

## 关键行为

- `schedule()`：在仍处于 streaming 时创建 pending DOM，并开始每秒更新时间提示
- 显示时会调用 `revealStreamingAssistantMessageElement()`，避免长时间空白 shell
- 若当前 tab 仍是活动 tab，会继续触发一次 settled scroll
- `clear()`：既能取消“尚未显示”的延迟，也能回收已显示的 interval 与 DOM

## 协作边界

- 不消费 stream chunk
- 不判断“首个可见内容”何时到达
- 不记录 debug trace；只在真正显示时把事件回调给上层

## 注意事项

- pending 文案是随机选取的，单次发送生命周期内保持固定。
- 定时器 id 暂存在 DOM dataset 中，修改 DOM 结构时要保留这条清理路径。
