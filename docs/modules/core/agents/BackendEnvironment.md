# BackendEnvironment

> **源码**: `src/core/agents/BackendEnvironment.ts`
> **状态**: [REVIEW]

## 概述

R-F7（advantage-parity）每供应商环境变量分域的纯模型层：`shared` 域作用于全部后端，`providers[backend]` 域只作用于一个后端（键为内建后端 kind 或自定义供应商 / ACP agent id）。既有的每后端 legacy env 设置（如 `backendSettings.claudeCode.env`）保持最终覆盖优先级——分域合并在其之下，不建第二套 env 真相。

导出：

- `normalizeEnvironmentVariablesDomains(raw)`：未知持久化值 → 干净分域（键/值裁剪，空键与非字符串值丢弃，providers 键裁剪非空）。
- `resolveBackendEnvironment(domains, backend, legacyEnv?)`：`shared` < `providers[backend]` < `legacyEnv` 的合并结果。
- `computeEnvironmentFingerprint(env)`：键排序后 digest 的稳定指纹——仓库 `(hash*33)^code` djb2 家族的双 32 位 lane 64 位化（16 hex；本项目 ES target 无 BigInt）。空 map 也有稳定值。
- `detectChangedBackends(previous, current)`：以 current 键集为准，previous 缺失或指纹不同的后端即「变化」。
- `computeBackendEnvironmentFingerprints(domains, backends, legacyEnvFor?)`：一次算出各后端（含 legacy）的指纹。

纯模块：无 I/O、无 feature/app/i18n import。消费方为 `src/main.ts`（指纹失效信号 + 构造缝）与 `src/core/types/settings*`（设置形状与 load 归一化）。
