# app/diagnostics types

> **源码**: `src/app/diagnostics/types.ts`
> **状态**: [REVIEW]

`DiagnosticsRuntimeCoordinator` 的窄 port 类型。`DiagnosticsBackendPorts` 把三个后端 trace service 作为 typed properties 暴露（每后端一个具体类型，禁止 service-locator map）。`DiagnosticsRuntimeInputs` 镜像此前 `main.ts` 内联的 option getter 集合：每后端的 settings/knownSecrets/runtimeMetadata getter、解析后的 vaultPath、以及 buildIdentity getter。所有 getter 惰性求值，使 credential rotation 与 settings 变更在各 service 读取时点生效。本文件不持有 runtime state。
