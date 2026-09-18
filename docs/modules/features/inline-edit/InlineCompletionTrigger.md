# InlineCompletionTrigger

> **源码**: `src/features/inline-edit/InlineCompletionTrigger.ts`
> **状态**: [REVIEW]

## 概述

R-C3 的 Alt 空按手势判定（§3.4）。裸修饰键无法用 CM6 keymap 匹配，ghost 扩展把 keydown/keyup 记录喂给纯函数 `isAltSoloGesture`；有状态的窗口/重置规则收在 `AltSoloGestureTracker`。

## 职责

- `isAltSoloGesture(events)`：`[keydown Alt, …无其他键…, keyup Alt]` → `trigger`；只有 down → `pending`；期间任何其他键、组合态、或 down→up 间隔超 1000ms → `none`
- `AltSoloGestureTracker`：时间窗过期、非 Alt 键重置、触发后清缓冲；OS 按住 Alt 的 key repeat 被忽略——手势起点保持**最初**按下时刻，长按不能自己把窗口刷合法
- 事件记录带可选 `at` 时间戳（设计签名的超集），窗口检查在两侧都有时间戳时生效

## 依赖

- 无（纯模块）

## 维护约束

- 手势参数（Alt、1000ms 窗口）是设计定案；macOS Option 手感属真机验收项，命令改绑是既定兜底
- 组合态（`isComposing`）在纯函数层就被判 `none`——不要把 IME 守卫只留在 DOM handler 层
