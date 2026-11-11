# app/diagnostics types

> **源码**: `src/app/diagnostics/types.ts`
> **状态**: [REVIEW]

`DiagnosticsRuntimeCoordinator` 的窄 port 类型。`DiagnosticsBackendPorts` 把三个后端 trace service 作为 typed properties 暴露（每后端一个具体类型，禁止 service-locator map）。`DiagnosticsRuntimeInputs` 镜像此前 `main.ts` 内联的 option getter 集合：每后端的 settings/knownSecrets/runtimeMetadata getter、解析后的 vaultPath、以及 buildIdentity getter。注意 knownSecrets 构造时序不对称：OpenCodeSessionTraceService 构造时调用一次 `knownSecrets?.()` 并把结果数组交给 redactor（构造时快照），而 Codex/Claude 把 getter 本身交给 redactor（每次 redact 重新求值）；settings、buildIdentity、runtimeMetadata 各 service 惰性读取。`DiagnosticsBackendPorts` 现含第四个 typed property `dsh: DshSessionTraceService`（2026-11-10，实施机制已冻结，独立复核/宿主验收待完成）；仍是每后端一个具体类型属性，禁止 service-locator map。`DiagnosticsRuntimeInputs` 相应增加 DSH 的 settings/knownSecrets/runtimeMetadata getter，`dshSettings` 可缺省（缺省时 coordinator 使用全关门的缺省 getter，DSH store 保持 disabled）。本文件不持有 runtime state。
