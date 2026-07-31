# DiagnosticsRuntimeCoordinator

> **源码**: `src/app/diagnostics/DiagnosticsRuntimeCoordinator.ts`
> **状态**: [REVIEW]

app 层诊断 owner。集中构造三个后端 trace service（OpenCode、Codex、Claude），暴露 typed backend ports（`openCode`/`codex`/`claude`，每后端一个具体类型属性，而非泛型可变 service map），并统一 flush/dispose 生命周期。构造顺序固定为 OpenCode → Codex → Claude，与此前 `main.ts` 内联构造一致；每个 service 接收相同的 option getter（settings、vaultPath、buildIdentity、knownSecrets、runtimeMetadata）。注意 OpenCode 的 knownSecrets 构造时序行为：OpenCodeSessionTraceService 构造函数在构造时调用一次 `options.knownSecrets?.()` 并把结果数组交给 redactor（构造时快照），而 Claude/Codex 把 getter 本身交给 redactor（每次 redact 重新求值）；coordinator 透传各后端的 getter，不改变这一不对称。dispose 顺序固定为 OpenCode → Codex → Claude，`dispose()` 顺序 await 每个后端的 `.dispose().catch(...)`（fail-closed warn 日志，确定性 teardown），main.ts onunload 以 `void` 调用（fire-and-forget，保持此前 unload 时序）。`main.ts` 在 `handleBootstrapOpenCodeRuntime` 中只构造一个 coordinator，并通过 delegating getter 暴露给既有 consumer（`this.plugin.openCodeTraceService` 等），这些 shim 在 Task 12/13 迁移 consumer 后移除。本 owner 不合并三后端事件 schema 或内部状态；它只负责构造、注入 seam 与生命周期。
