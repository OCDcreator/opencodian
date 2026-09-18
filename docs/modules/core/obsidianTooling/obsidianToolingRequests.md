# 工具确认请求/决策模式

> **源码**: `src/core/obsidianTooling/obsidianToolingRequests.ts`
> **状态**: [REVIEW]

## 概述

确认握手的纯模式层（无 Obsidian/Node 依赖）：门脚本写入的 `<id>.request.json` 的严格校验（id/子命令/argv/时间戳/等待时长，argv 首个位置参数必须与声明子命令一致——防止"对话框显示的内容与实际执行的不一致"），以及协调器写回的单行 `<id>.decision.json`（`allow` / `deny` / `expired` / `invalid`）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `parseToolingRequest()` | 严格校验；畸形请求返回结构化 reason（协调器回写 `invalid` 让轮询的包装脚本尽早停止） |
| `toolingRequestIdFromFilename()` | 仅从 `<id>.request.json` 提取（忽略 tmp/decision/噪音文件） |
| `buildDecisionDocument()` | 单行 JSON 决策文档 |
| `requestRequiresConfirmation()` | 二次确认（与目录分类一致的防御性检查） |
