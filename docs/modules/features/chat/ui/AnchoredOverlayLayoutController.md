# AnchoredOverlayLayoutController

> **源码**: `src/features/chat/ui/AnchoredOverlayLayoutController.ts`
> **状态**: [REVIEW]

## 概述

聊天局部浮层的共享水平布局所有者。它以最近的 Chat 容器为边界，按 `start` 或 `end` 锚定计算浮层的实际宽度与相对 `left` 偏移，并通过 `ResizeObserver` 在侧栏尺寸变化时重新同步。

## 公开接口

```typescript
export type OverlayHorizontalAlignment = 'start' | 'end';
export function calculateAnchoredOverlayLayout(input: AnchoredOverlayLayoutInput): AnchoredOverlayLayout;

export class AnchoredOverlayLayoutController {
  sync(): boolean;
  observe(): void;
  destroy(): void;
}
```

## 关键行为

- 首选宽度不得超过边界扣除左右 `safeInset` 后的可用宽度。
- 当 Chat 容器窄于配置的最小宽度时，`width` 与 `min-width` 会继续同步收缩，避免 CSS 最小宽度重新撑出边界。
- `start` 以 anchor 左边对齐，`end` 以 anchor 右边对齐；两种模式最终都钳制在边界安全区内。
- Observer 只在浮层打开时触发同步；每次打开会强制刷新一次 boundary 订阅，避免 Obsidian DOM 重排后继续持有陈旧 observer；`destroy()` 必须断开 observer。
- 如果组件 mount 时尚未进入 Chat 容器，首次成功 `sync()` 会晚绑定 observer；同一 boundary 不会重复订阅，boundary 变化时会先断开旧 observer。
- 找不到 boundary 或运行环境没有 `ResizeObserver` 时不写入 inline geometry，保留组件原有 CSS 回退行为。

## 当前消费者

- Model dropdown：340px 首选、280px 最小、`start`。
- Agent dropdown：340px 首选、272px 最小、`start`。
- Permission dropdown：280px 首选、220px 最小、`start`。
- Effort dropdown：以菜单实际内容宽度为首选、60px 最小、`end`。
