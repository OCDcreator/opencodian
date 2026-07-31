# DiagnosticsRuntimeCoordinator

> **源码**: `src/app/diagnostics/DiagnosticsRuntimeCoordinator.ts`
> **状态**: [REVIEW]

app 层诊断 owner。集中构造三个后端 trace service（OpenCode、Codex、Claude），暴露 typed backend ports（`openCode`/`codex`/`claude`，每后端一个具体类型属性，而非泛型可变 service map），并统一 flush/dispose 生命周期。构造顺序固定为 OpenCode → Codex → Claude，与此前 `main.ts` 内联构造一致；每个 service 接收相同的 option getter（settings、vaultPath、buildIdentity、knownSecrets、runtimeMetadata），因此构造时序不对称（OpenCode 静态 knownSecrets 快照 vs Claude/Codex 动态 getter）在 coordinator 中保持不变。dispose 顺序固定为 OpenCode → Codex → Claude，每个以 `void … .catch` 包装，throwing trace flush 不得阻塞 plugin unload，且每后端保留与此前一致的 warn 日志。`main.ts` 在 `handleBootstrapOpenCodeRuntime` 中只构造一个 coordinator，并通过 delegating getter 暴露给既有 consumer（`this.plugin.openCodeTraceService` 等），这些 shim 在 Task 12/13 迁移 consumer 后移除。本 owner 不合并三后端事件 schema 或内部状态；它只负责构造、注入 seam 与生命周期。
