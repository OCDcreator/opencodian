# OpenCodeTraceEventInspector

> **源码**: `src/core/opencode/diagnostics/OpenCodeTraceEventInspector.ts`
> **状态**: [REVIEW]

单次检查 OpenCode 原始事件，识别序号缺口/乱序、session 串线、孤立 part/delta、问题权限等待、工具交互和后台任务终态，向 trace service 返回无副作用的分类结果。
