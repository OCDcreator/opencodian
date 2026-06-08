# TextareaSizeMemory

> **源码**: `src/features/settings/TextareaSizeMemory.ts`
> **状态**: [REVIEW]

## 概述

`TextareaSizeMemory` 是 settings textarea 尺寸记忆 helper。它为可手动 resize 的 textarea 绑定稳定 key，把用户调整后的高度写入 `localStorage`，并在下次创建同一 textarea 时恢复高度。

## 核心逻辑

- `attach(textarea, key)` 会立即读取 `opencodian:settings-textarea-size:<key>` 并恢复已保存高度
- 可用 `ResizeObserver` 时监听 textarea content rect 的高度变化并持久化
- `destroy()` 断开 observer，供 modal `onClose()`、section `dispose()` 或重新渲染前清理
- `localStorage` 读写失败会被静默忽略，避免 private browsing 或宿主限制影响 settings UI

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 创建 memory 实例、恢复高度并开始观察 resize |
| `simulateResize()` | 测试辅助方法，用于 jsdom 下模拟 ResizeObserver 回调 |
| `destroy()` | 停止观察并标记实例已销毁 |

## 维护注意

- 新 textarea 应使用稳定、语义化 key，避免不同编辑器互相覆盖高度。
- 动态重渲染的 settings surface 需要在替换 DOM 前销毁旧实例，防止 observer 泄漏。
