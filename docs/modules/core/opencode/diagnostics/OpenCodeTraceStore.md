# OpenCodeTraceStore

> **源码**: `src/core/opencode/diagnostics/OpenCodeTraceStore.ts`
> **状态**: [REVIEW]

异步批量写入 v1 JSONL，分别保存 structural、deep 与 runtime 数据。队列同时计算 structural/deep bytes，跨 flush 强制 deep run 10 MiB 上限；过载记录 coalesced/dropped，即使没有后续 append、直接 flush/dispose 也会在不突破 4096 条/4 MiB 队列界限的前提下持久化压力通知。索引分别保存历史最高严重度与最高未读严重度，并提供 structural JSONL 重建、旧索引兼容、会话绑定、崩溃尾行恢复、7 天/24 小时轮转、原子索引、导出二次文本脱敏、自定义目录回退、POSIX 0700/0600 best-effort 权限和 5000 条内存降级环。memory mode 的 structural/runtime 读取会与降级前磁盘数据稳定去重合并，deep 读取仍只认磁盘文件。首次降级先切换 memory mode，再把原始错误和关联模板交给 listener；生产 listener 走 TraceService 正常 redactor/sequence/console 路径且不会递归写盘。无 listener 的 standalone store 只保留固定安全错误文案和隔离 runtime id，不复制原始路径或秘密。
