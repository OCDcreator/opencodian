# obsidian-gate 门脚本生成器

> **源码**: `src/core/obsidianTooling/obsidianGateScript.ts`
> **状态**: [REVIEW]

## 概述

生成 POSIX sh 包装脚本 `obsidian-gate`（本里程碑仅 macOS/Linux），这是高影响确认要求的**机制**而非提示词：agent 被告知（注入块）经包装脚本调用 CLI；包装脚本对 high-impact 子命令写入 `requests/<id>.request.json` 并轮询等待插件写入的 `<id>.decision.json`。无决策 → 不执行（exit 4）；拒绝 → exit 3；决策文件不可读 → exit 5（fail-closed）；允许 → 以**完全相同的原始 argv** exec 真实 CLI。未知子命令一律按 high-impact 处理。

## 关键导出

| 导出 | 说明 |
|------|------|
| `buildGateScript({cliCommand, waitSeconds})` | 纯函数、字节级确定性（同输入同输出，协调器据此跳过未变更文件的重写） |

## 边界与约束（威胁模型的诚实陈述）

- 包装脚本只约束**受认可路径**：同用户进程（含失控模型）仍可直接调用裸 `obsidian` 二进制、或自行伪造决策文件。该门保证"默认必现确认对话框、无决策不执行"，不是对抗性沙箱；残余风险在 owner 概览与需求报告中如实披露。
- 请求文件以 tmp+`mv` 原子落盘；argv 经 JSON 转义记录；`$RANDOM` 在 dash 下为空但 id 仍由 date+pid 保证唯一。
