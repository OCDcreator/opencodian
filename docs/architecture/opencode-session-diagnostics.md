# OpenCode 后端会话诊断

## 边界

该诊断链仅由 OpenCode adapter/service 使用，不改变 Claude Code、Codex、ACP 或其他 backend。结构轨迹默认开启；深度内容只由聊天当前标签显式武装，并通过 `diagnosticRunToken` 沿该标签的 send pipeline 传递。

## 数据流

`OpenCodeSessionTraceService` 在插件启动时建立 `runtimeSegmentId`。会话创建时记录 bootstrap 并绑定稳定 trace；每轮发送建立 run。SDK façade、SDK fetch、legacy HTTP、SDK/legacy SSE、流归一化、ServerManager 和 LocalSidecarLauncher 都通过可选 `OpenCodeTracePort` 报告证据。

所有载荷先经过 `OpenCodeTraceRedactor`。普通 structural 文件只保留类型、尺寸、ID、状态、耗时和异常；deep 文件才包含经过脱敏与限长的正文。runtime 文件单独保存服务生命周期。写入失败不会影响聊天，会回退到内存环；读取 structural/runtime 时会把既有磁盘 JSONL 与降级后的内存事件稳定去重合并，但 deep 正文绝不从内存恢复。插件路径中的首次降级由 TraceService 使用正常 redactor 与单调序号生成、写入并输出 `trace.storage_degraded`；Store 无 listener 时只生成无原始错误正文且使用隔离 runtime id 的 fail-safe 事件。自定义目录回退留下的 `lastError` 也会让聊天显示 degraded。

路径脱敏同时识别 macOS/Windows 前缀的原始斜杠、反斜杠和 `encodeURIComponent` 形式，并在 console、structural JSONL 与报告中统一替换为 `$DIAGNOSTICS`、`$VAULT`、`$TMP` 或 `$HOME`。智能报告在交给剪贴板调用方前对全部正文再次应用同一个 OpenCode redactor，覆盖 actual/expected/reproduction 用户上下文和构建/元数据文本，随后仍运行通用诊断文本 sanitizer 作为第二道防线。该处理只作用于诊断副本中的已知前缀，不解码或重编码整条 URL，也不改变真实 HTTP 请求。

诊断上下文显式随每次 send、SDK façade、fetch 和 streaming runtime 传递；活动运行以 `runId` 保存，避免同一 backend session 被两个标签并发发送时串线。raw ingress 与 normalized outcome 共享 `sourceEventId`；无法证明的关联保持 unresolved，不推测。

聊天头状态刷新同样保持显式 tab 关联：目标 tab claim 一次性 token 后立刻从 armed 映射为 capturing；send pipeline 在 completed、error 或 cancel 的 terminal `finally` 再发出同一 tab 的刷新信号。View 只有在 changed tab 仍为 active tab 时才刷新 header DOM，后台或并发标签不会改写当前标签状态。

deep run 在 prompt 前通过 SDK/legacy 共用的权威 session-messages 入口记录 plugin-normalized `capture.session_snapshot`；它不是 SSE ingress，仍保留同一 trace/run/deep 关联。读取失败只写 warning/incomplete，发送继续，普通 run 不产生这次预读。

同步事件会进入 structural trace；task/child session 事件建立父子关系并执行 5 层/20 后代限制。后代配额按 run/tree 计算，不跨运行永久累积；run 结束后 child 只保留父 trace/root 的 runless structural correlation，不再携带旧 run/deep/tab。当前实现无法从所有 OpenCode 版本可靠观察关联后代的稳定终止，因此前台结束时仍有 interaction 或已发现后代的 deep capture 会明确写 `capture.association_incomplete`，并以 `incomplete` 结束，不能解读为完整后代捕获。

SDK foreground stream 降级到 legacy SSE、以及全局 event subscription 重连都会记录 attempt；连续 3 次进入 warning，收到第一条恢复事件后写 recovery 并复位计数。全局订阅没有可靠 session 时只标记 runtime-window/unresolved。

本地 sidecar stdout/stderr 在进入 logger、80 行错误尾部和 trace port 前先独立脱敏，即使 session trace 总开关关闭也不会恢复原文。deep capture 的完整控制台通道使用不可被全局 debug/module gate 抑制的镜像路径；非 deep 高频事件仍遵守全局、模块、预设和通道开关。

## 用户入口

OpenCode 聊天头提供当前标签的“捕获下一次运行”“取消捕获”“复制本会话诊断”。聊天复制严格使用 current-session 选择；当前会话尚无 trace 时输出明确的空范围报告，不回退到其他标签或会话。设置 → 调试 → OpenCode 提供总开关、控制台预设、六通道、目录、状态、最近轨迹、智能复制、全量导出、单条删除和二次确认清空。

索引分别保存历史最高严重度和最高未读严重度。聊天徽标与智能报告只按未读严重度决策；设置轨迹目录的异常筛选仍按历史严重度保留已读故障。

## 安全与归因

报告包含 Provider/模型及本地 HMAC 凭据指纹，但本地证据不能证明供应商最终计费归属。分享前仍需用户检查；任何日志都不会自动上传。

## 验收边界

自动化测试覆盖脱敏失败隔离、并发标签、SDK/legacy transport、流因果关联、JSONL 恢复/轮转/容量/权限/目录回退、报告 1 MiB 上限和导出二次脱敏。macOS Test Vault、Windows、真实 remote/external OpenCode、真实 30 分钟 wall-clock capture 以及完整后代稳定终止仍需分别做真实运行验收；未完成这些场景前不得宣称跨平台或真实 Obsidian 验收完成。
