# RemoteControlAuth

> **源码**: `src/core/remotecontrol/RemoteControlAuth.ts`
> **状态**: [REVIEW]

## 概述

R-C6 远程驱动的令牌纯函数层（R-C6 设计 §4.3）。无副作用、无 IO、无日志，全部可单测。职责：令牌生成（`crypto.randomBytes(32)` → base64url，256-bit 熵）、审计指纹派生（sha256 前 12 hex）、`Authorization: Bearer` 提取、常数时间令牌比对、绑定地址环回分类。

## 导入关系

```text
上游: node:crypto
下游: RemoteControlService.ts、RemoteControlAudit.ts、SettingsRemoteControlSection.ts、main.ts（knownSecrets）
```

## 核心逻辑

### 生成与指纹

- `generateRemoteControlToken()`：仅在用户显式开启功能或点击"重新生成"时调用。
- `deriveTokenFingerprint(token)`：sha256 前 12 hex；审计与设置页状态行只展示指纹，令牌本体永不回显。

### 常数时间比对

`tokensMatch(provided, stored)`：两侧各做 sha256 得到等长 32 字节摘要后 `crypto.timingSafeEqual`。原始串长度差异不会以异常或计时形式泄漏；`provided` 为 null（缺失/畸形头）或 `stored` 为空（开启但未签发）一律 false（fail-closed）。调用方对全部失败情况返回同一固定 401 文案，使"缺令牌"与"错令牌"不可区分。

### Bearer 提取

`extractBearerToken(header)`：大小写不敏感 `^Bearer\s+(\S+)\s*$`；其余（Basic、空、多段、无 scheme）返回 null，由比对层统一 401。

### 环回分类

`isLoopbackBindAddress(address)`：`127.0.0.1` / `::1` / `localhost` 视为环回；其他任何值（含 `0.0.0.0`、`::`、主机名）为非环回，需 `remoteControlNonLoopbackAcknowledgedAt` 二次确认（UI 模态 + 服务端启动时二次校验，双保险）。`localhost → 127.0.0.1` 的归一化本体在 `src/core/types/settings.ts` 的 `normalizeRemoteControlBindAddress`。

## 注意事项

- 比对比较的是摘要而非原文：sha256 是确定性的，等价于按值比较，但长度恒定，规避了 `timingSafeEqual` 的长度异常路径。
- 本模块不持久化任何东西；令牌持久化走 `OpenCodianSettings.remoteControlToken` 既有凭据路径（默认空串 + 逐字段归一化，先例 `CodexBackendSettings.apiKey`）。
- 单测：`tests/unit/core/remotecontrol/RemoteControlAuth.test.ts`（生成熵/指纹/Bearer 边界/等长错令牌/环回分类）。
