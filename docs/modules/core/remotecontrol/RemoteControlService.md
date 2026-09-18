# RemoteControlService

> **源码**: `src/core/remotecontrol/RemoteControlService.ts`
> **状态**: [REVIEW]

## 概述

R-C6 远程驱动的监听服务本体（R-C6 设计 §4.2 / §4.4 / §4.5 / §5）。一个 token 鉴权的环回 `node:http` 服务，允许外部程序驱动**一个专用** OpenCode 会话：`GET /v1/health`、`POST /v1/instruction`（同步取结果）、`GET /v1/session`。**关闭态不构造 `http.Server`、零 `listen` 调用**——不是"监听后拒绝"，而是无套接字（契约测试用 `LocalProcessProbe.canBindLocalEndpoint` 双栈探活证明）。

## 导入关系

```text
上游: node:crypto/node:http、core/types（设置与 StreamChunk）、./RemoteControlAuth、./RemoteControlAudit
下游: src/main.ts（组合）、SettingsRemoteControlSection.ts（状态展示）
```

**零改动 `OpenCodeService`**：会话驱动经注入的窄端口 `RemoteControlSessionDriver`（`createSession` / `sendMessage` / `cancelStream`），由 `main.ts` 绑定到 `OpenCodeService` 既有公开 API。超时中止走 `cancelStream(sessionId)`——它内部就是 `OpenCodeSessionLifecycleCoordinator.abortSession`（设计指名的既有中止路径）外加本地流拆除。

## 固定 fail-closed 处理顺序

```
① Host 白名单(403 forbidden_host) → ② 方法+路径白名单(405 / 403 unknown_operation)
→ ③ 令牌常数时间比对(401，缺/错同文案) → ④ 体上限 64KiB + JSON + 封闭形态(413/400)
→ ⑤ 单飞行(409 busy) → ⑥ 执行 → 终态
```

- 错误码封闭集：`unauthorized / forbidden_host / unknown_operation / method_not_allowed / malformed_request / busy / payload_too_large / internal_error`。
- 请求体是**封闭形态**：恰好一个 `instruction` 字符串字段（≤32k 字符）；任何额外字段（如假想的 `path`/`op`）结构性 400——vault 外读取被拒是"构造上成立"，不是过滤。
- 白名单是代码内显式枚举（`REMOTE_CONTROL_OPERATIONS`），非配置驱动；未知路径一律 `unknown_operation`，且预执行拒绝全部进审计（`request.rejected`）。
- 常量：端口固定 `4105`（不配置化，冲突显式失败）、`maxConnections=4`、`Connection: close`、无 CORS、`OPTIONS`→405。

## 状态机与会话模型

- 生命周期：`off | listening | error`（error = 未监听，带 `blockedReason`：`missing-token` / `non-loopback-unacknowledged`，或 `bindError`）。`applySettings()` 原子重载：停旧 → 校验 → 起新；绑定失败回退关闭态并显式报错（notify），绝不带着旧配置硬撑。签名（地址+令牌指纹）未变则不重启，令牌轮换即时生效。
- 单飞行：`idle → running → idle`，检查与置位同步完成；第二条并发指令 409。
- 专用远程会话：`createSession('OpenCodian Remote Control', { setCurrent: false })`，与用户活动 tab 会话完全隔离；`for await` 消费 `StreamChunk` 聚合 `text`，终态映射 `completed | error | timeout`（`cancelled` 为 v1 保留字面量）。
- 硬轮限默认 15 分钟（测试可注入毫秒级）：到期调 `cancelStream` 并以 `terminalState: "timeout"` 返回已聚合的部分结果——显式标注，绝不伪造成 completed。

## 审计联动

预执行拒绝（401/403/405/400/413/409）发 `request.rejected`；指令终态发 `request.terminal`（含指令摘要与终态四要素）；启停/绑定失败发 `lifecycle.*`。详细内容契约见 `docs/modules/core/remotecontrol/RemoteControlAudit.md`。

## 注意事项

- 令牌为空但开关开启 → `error/missing-token`（fail-closed）；关闭不清令牌（关闭 ≠ 吊销），吊销走设置页"重新生成"。
- 审计实例惰性构造：关闭态连诊断目录都不创建。
- 端口/轮限时仅构造器注入可改（测试接缝），生产路径恒为 4105 / 15min。
- 单测/契约/e2e：`tests/unit/core/remotecontrol/RemoteControlService.test.ts`（关闭态双栈探活、缺令牌/非环回拒启、端口占用 fail-closed、401 不可区分、Host/白名单/413/400、round trip、409、超时中止、审计无内容）。
