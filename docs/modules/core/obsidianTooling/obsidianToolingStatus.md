# 工具能力状态快照契约

> **源码**: `src/core/obsidianTooling/obsidianToolingStatus.ts`
> **状态**: [REVIEW]

## 概述

跨边界状态契约（放 core 而非 app：产方是 app 协调器，消费方是设置界面，而设置 owner 只能 import core/shared）。`ObsidianToolingStatusSnapshot`：模式、桌面端支持、平台支持（Windows 本里程碑无包装脚本——如实显示而非静默）、门就绪、最近探测结果、待确认请求数。

## 关键导出

| 导出 | 说明 |
|------|------|
| `ObsidianToolingStatusSnapshot` | 设置页状态行与注入规划的统一事实 |
