# autoScrollState

> **源码**: `src/features/chat/autoScrollState.ts`
> **状态**: [REVIEW]

## 概述

`autoScrollState.ts` 是聊天消息区自动滚动的纯函数助手。它不依赖 DOM，不持有全局状态，只负责根据滚动度量和用户意图计算“是否继续自动跟随到底部”。

这个文件的价值在于把 `OpenCodianView` 里的自动滚动判定抽成了可测试、可复用的小状态机。

## 导出项

```typescript
export const AUTO_SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 100;
export const AUTO_SCROLL_GUARD_MS_INSTANT = 120;
export const AUTO_SCROLL_GUARD_MS_SMOOTH = 500;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface AutoScrollSnapshot {
  autoScrollEnabled: boolean;
  isNearBottom: boolean;
  programmaticScrollGuardUntil: number;
}
```

## 核心逻辑

- `getDistanceFromBottom(metrics)`: 计算当前距离底部的像素距离。
- `isNearBottom(metrics, threshold?)`: 判断是否仍处于“可自动跟随”的近底部区间，默认阈值 `100px`。
- `applyUserScrollIntent(state, nearBottom)`: 当滚动被视为用户主动行为时，同时更新 `autoScrollEnabled` 与 `isNearBottom`。
- `applyPassiveScrollMeasurement(state, nearBottom)`: 仅更新测量结果，不改变用户意图。
- `getProgrammaticScrollGuardDelayMs(behavior)`: 把浏览器滚动行为映射成 programmatic guard 时长。
- `hasProgrammaticScrollGuard(state, now?)`: 判断当前是否仍处于“忽略程序性滚动回声”的保护窗口。

## 与其他模块的交互

- `OpenCodianView.ts`：消费这些 helper 来区分“用户手动滚动”和“程序触发滚动”。
- 单元测试：这里是聊天自动滚动行为最稳定的测试落点之一。

## 注意事项

- 这里不执行任何 `scrollTo` 或 DOM 读写，调用方必须自己提供 `ScrollMetrics`。
- `applyUserScrollIntent()` 和 `applyPassiveScrollMeasurement()` 的区别很重要；前者会改变自动滚动开关，后者不会。
