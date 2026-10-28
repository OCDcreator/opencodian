# Memory Runtime Coordinator

> **源码**: `src/app/memory/MemoryRuntimeCoordinator.ts`
> **状态**: [REVIEW]

app.memory-runtime 的组合入口。将通用 core.memory 绑定到 Vault/外部文件系统、设置和会话所属后端的 AgentAuxQueryCapability；main.ts 只传 registry、会话读取端口和可选 embedding 客户端。已移除旧 OpenCodeService 临时会话依赖。

| 方法 | 行为 |
|---|---|
| planInjection | 按会话与实际目录维护索引纪元、正文去重及字符预算；逐回合召回；设置代次变化或卸载后丢弃过期结果 |
| onTurnSettled | 每会话防抖，统一队列串行执行，避免不同会话互相跳过或并发更新索引 |
| invokeModel | 读取已保存的 backend，确认 enabled，必要时启动该适配器，创建只读辅助会话；验证 runtime safety 和实际 tool calls，finally dispose |
| runExtractionGuarded | 失败不推进消息水位；当前未处理消息切片供操作循环提取 |
| runReflectionGuarded | 压缩标记增长后先反思；失败保留重试机会 |
| runAgentExtraction | 从已完成且具备实质正文的命名 task/agent 结果提取独立笔记本；按任务与结果水位去重 |
| onSettingsChanged / dispose | 使旧任务代次失效、取消辅助会话；卸载清理定时器和同步服务 |

模型按 memoryModelOverrides[backend] / memorySelectorModelOverrides[backend] → 会话选择或有效 context usage → 后端默认解析；遗留 memoryExtractionModel 仅兼容 OpenCode 2，不泄漏到其他后端。Claude/Codex 使用模型 ID，其他后端使用 provider/model。未知、退休、禁用或缺能力后端 fail-soft，绝不改发当前活动后端。

提取与反思使用辅助后端标准 180 秒预算，筛选为 30 秒。仅 Codex/ZCode 的原生辅助能力需要连接启动；Pi/Claude 直接建立隔离辅助通道，OpenCode 2 自身 ready 保证连接。

存储保留 vault-local 路径；共享模式使用 zmem 的 projects/<bucket>/memory，workspaceIdentity 优先于 workspacePathAliases。代理笔记本位于 agent-memory/<sanitized-key>，可显式指定独立根以共享 ZCode 用户级目录，使用长版 Persistent Agent Memory 协议。状态/体检/遗忘命令默认作用于项目桶。

Git 同步独立于任何聊天后端，覆盖 memoryExternalRoot 整棵树；成功写入/遗忘后 scheduleSync。独立 agent 根位于该树外时不被此同步覆盖。设置和会话内容未被后台调用修改。接口模拟不等于原生/UI验收；各后端辅助通道仍受本机配置和运行时只读能力约束。
