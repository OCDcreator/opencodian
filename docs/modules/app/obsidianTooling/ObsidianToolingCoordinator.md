# ObsidianToolingCoordinator

> **源码**: `src/app/obsidianTooling/ObsidianToolingCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`app.obsidian-tooling` owner 的运行时协调器（`main.ts` 仅构造/`dispose`，模式与设置经由 `getMode` 回调）。职责：按 `obsidianToolingMode` 的生命周期（**off = 零成本**：不探测、不注入、不监听）；向 `.opencodian/obsidian-tooling/` 供给门脚本（内容变更才重写，含 chmod +x）与 requests 目录；fs.watch + 15s 兜底扫描确认请求；fail-closed 请求处置（畸形 → `invalid`、过期 → `expired`、弹窗关闭/Esc = `deny`、决策串行弹窗队列）；探测缓存与 `refreshProbe()`；后端无关注入计划（每 epoch 一次，供 `MessageSendPreparationService` 经插件字段消费）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `applySettings()` | 幂等的模式同步；非 `cli` 或平台不支持时全部拆除 |
| `planInjection({conversationId, messages})` | fail-soft；可用性变化直接反映为注入块变体 |
| `getStatus()` / `refreshProbe()` | 设置页状态行与"重新检测" |
| `dispose()` | 关闭 watcher/定时器、清空队列与 epoch 状态 |

## 边界与约束

- 决策经 vault 适配器写入 `.opencodian/obsidian-tooling/requests/`（与 StorageService 的 envelope 同一路径约定）；处理过的请求/决策文件在宽限期后清理。
- 探测可注入（测试密封性）；默认对真实 `obsidian version` 探测。
- 诚实边界：门机制约束受认可路径，无法防御同用户的对抗性进程/模型（见 core-obsidian-tooling 概览）。
