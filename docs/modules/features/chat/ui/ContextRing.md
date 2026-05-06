# ContextRing

> **源码**: `src/features/chat/ui/ContextRing.ts`
> **状态**: [REVIEW]

## 概述

SVG 环形仪表组件，用于在聊天工具栏中实时显示当前会话的上下文窗口使用率。通过 `ContextUsageService.summarize()` 获取用量摘要，以环形进度条 + 百分比标签 + CSS 色调状态（success / warning / danger / muted / unavailable）呈现；当 session 正在做原生 compaction 时，ring 会切到 compacting 提示。视觉上它跟随输入工具栏统一高度，默认是轻量圆形按钮，`action-buttons-etched` 时切换成透明刻入状态。

## 导入关系
上游: `TabContextState`（来自 `core/types`）、`i18n`、`ContextUsageService`（来自 `features/chat/services/ContextUsageService`）
下游: 被 `OpenCodianView` 在工具栏区域实例化

## 核心类型 / 接口

无独立导出类型。依赖 `TabContextState` 作为输入。

## 核心逻辑

### 环形进度条渲染

使用 SVG `<circle>` 元素，`RADIUS=6`，`CIRCUMFERENCE = 2πR`。进度通过 `strokeDashoffset` 控制，offset = `CIRCUMFERENCE * (1 - percentage/100)`。

### 色调状态切换

每次 `update()` 调用时移除所有 `is-success`、`is-warning`、`is-danger`、`is-muted`、`is-unavailable` 类，再根据 `summary.tone` 添加对应类。

### 无障碍

- 生成唯一 `srLabelEl.id`，通过 `aria-labelledby` 关联
- `data-tooltip` 提供 hover 提示
- `aria-hidden="true"` 用于 SVG
- `summary.isCompacting` 时，屏幕阅读器标签会优先读出“Compacting context…”而不是百分比

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(parentEl, onClick)` | 创建按钮容器、SVG 轨道/进度圆、标签元素，绑定 click 事件 |
| `update(state)` | 根据 `TabContextState` 刷新进度偏移、色调类、标签文本、tooltip、无障碍文本 |
| `destroy()` | 从 DOM 移除按钮元素 |

## 数据流

```
TabContextState → ContextUsageService.summarize() → ContextRing.update()
                                                        ↓
                                              SVG strokeDashoffset
                                              CSS tone class
                                              label / tooltip text
```

## 与其他模块的交互

- **ContextUsageService**: 提供 `summarize()` 返回 `{ percentage, tone, ringLabel, tooltip, isUnavailable, isCompacting, contextWindow }`
- **OpenCodianView**: 持有 `ContextRing` 实例，在上下文状态变化时调用 `update()`，点击时打开 `ContextDetailModal`

## 配置项

无直接配置项。行为完全由上游 `TabContextState` 决定。

## 注意事项

- `tooltipLabelId` 是静态递增计数器，确保同一页面多个实例的 `aria-labelledby` 不冲突
- `destroy()` 仅移除 DOM，不清理上游数据源

## 补充说明

- `ContextUsageService.summarize()` 返回字段映射：`percentage` → strokeDashoffset 计算，`tone` → CSS 类 `is-{tone}`，`ringLabel` → labelEl 文本，`tooltip` → data-tooltip 属性，`isUnavailable` → 额外 `is-unavailable` 类
- CSS 色调阈值由 `ContextUsageService.summarize()` 内部逻辑决定，具体阈值参见 Worker 5 负责的 `ContextUsageService.md`
