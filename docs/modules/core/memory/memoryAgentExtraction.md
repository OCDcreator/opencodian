# Memory Agent Extraction

> **源码**: `src/core/memory/memoryAgentExtraction.ts`
> **状态**: [REVIEW]

后台提取的 Read/Edit/Write 操作循环，最多 6 次模型调用、每次最多 8 个操作。复用所有后端已有的只读辅助查询；原生工具权限不变，实际记忆写入由插件执行。

JSON 对外使用 operation: read/create/update，避免与 Claude 原生 Read/Write/Edit 工具名混淆；解析器保留旧 tool 字段兼容。真实 Claude 探针确认独立命名空间消除了被拒绝的原生 Write 尝试。

`runMemoryAgent` 只接收文件系统、模型端口和目标目录，不依赖适配器。新建主题可一次产生多条；更新已有主题必须先 Read，Edit 的 oldString 必须唯一匹配。兼容旧 memories JSON 返回，但只允许创建未存在的文件。

内部 `MemoryAgentWorkspace` 保存读取快照和暂存内容，提交前检查所有文件版本。直接子级 Markdown 文件白名单拒绝路径穿越、绝对路径、子目录、MEMORY.md；真实文件系统验证符号链接。新建文件额外检查 exists，避免将不可读文件误当成不存在。密钥扫描、24K 字符文件上限和设置代次检查在写入前执行；索引由插件更新，来源盖章为 extracted。暂存校验失败不落盘；文件系统写入中途失败仍可能留下已写主题，后续 lint 可发现未登记主题。

项目提取只处理上次水位之后的用户证据；代理笔记本则以已完成任务正文为证据。无内容时返回空操作，不臆造记忆。测试覆盖多文件创建、先读后改、来源、密钥、路径越界、版本冲突、设置变化。
