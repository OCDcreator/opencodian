# Core Remote Control Barrel

> **源码**: `src/core/remotecontrol/index.ts`
> **状态**: [REVIEW]

## 概述

R-C6 远程驱动（外部接口）owner `core.remotecontrol` 的 barrel 入口。转发三类导出：`RemoteControlAuth` 的令牌纯函数（生成/指纹/Bearer 提取/常数时间比对/环回分类）、`RemoteControlAudit` 的审计设施（TraceStore 组装、指令摘要、令牌指纹）与 `RemoteControlService` 的监听服务（状态机、封闭错误码集、白名单路由、解析器）。

## 导入关系

```text
上游: ./RemoteControlAuth, ./RemoteControlAudit, ./RemoteControlService
下游: src/main.ts（组合注入）; tests/unit/core/remotecontrol/**
```

## 聚合规则

### 只转发安全面

barrel 不转发 `RemoteControlRequestError`（服务内部类型），也不转发 TraceStore/TraceRedactor 本体（消费方经 `service.audit.store` 读取状态）。设置 UI 只 import `RemoteControlService` 类型与 `RemoteControlAuth` 的纯函数。

## 注意事项

- 该 owner 由 `architecture-owners.config.json` 的 `core.remotecontrol` 条目描述（risk: high）；允许依赖为 `shared.foundation` / `shared.diagnostics` / `core.types` / `core.opencode`（经窄驱动接口，实际源代码不 import `OpenCodeService`）。
- 禁止依赖 `feature` / `app`：监听器绝不 import 视图；组合只发生在 `main.ts`。
