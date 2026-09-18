# Obsidian CLI 可用性探测

> **源码**: `src/core/obsidianTooling/ObsidianCliProbe.ts`
> **状态**: [REVIEW]

## 概述

对 `obsidian version` 的短超时探测（CLI 是应用控制面，"可用"= 在 PATH 上且回答版本查询；只读、不改任何数据）。结构化结果四态：`available`（含版本串）/ `not-found`（ENOENT）/ `timeout` / `error`；spawn 实现可注入，测试不触真 CLI；探测永不抛异常（fail-closed 的诚实 UI 前提）。仅在模式为 `cli` 时被协调器调用。

## 关键导出

| 导出 | 说明 |
|------|------|
| `probeObsidianCli({command?, timeoutMs?, spawn?})` | 结构化探测结果，不抛 |
| `OBSIDIAN_CLI_DEFAULT_COMMAND` / `OBSIDIAN_CLI_PROBE_TIMEOUT_MS` | 默认 `obsidian` / 5000ms |
