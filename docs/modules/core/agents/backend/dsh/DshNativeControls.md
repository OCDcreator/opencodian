# DshNativeControls

源码：`src/core/agents/backend/dsh/DshNativeControls.ts`

`core.backend` 内的 DSH Native 控制协议边界。公开 DTO 供 adapter、聊天和设置 owner 使用；不依赖 feature/app，也不导入用户安装的 Harness 包。该模块隔离高风险 Native RPC、运行证据、会话授权和 generation fence；`DshAdapter` 仍拥有 client/process/会话生命周期。

## 合同

- `dshNativeControlCapabilities` 只接受 Native `/1` 握手和存在的 nativeRequest，再逐字段投影 configuration/control flags。缺失方法为 false；jobs/terminal/subagents/goal 的 `present` 保留实际布尔值，旧桥接缺失时为 null（未知）。`controlCapabilities.readback` 表示支持 `control/capabilities`，每个 lease 在当前 client 上刷新实际服务/方法；扩展操作结束后再刷新，更新同步快照，不能让 newly mounted terminal 继续受旧握手禁用。extensionSettings.mutate 向旧桥接兼容。
- 每个请求先从 adapter 获取 current-client lease；lease 激活 owner session，并在发送前、异步读回后校验身份、generation、存活和会话归属。失败返回固定安全错误；过期响应、错误与通知都不能成为新的运行证据。没有 raw exception/cause/secret 回流 UI。
- 配置描述保留真实 forms/profile/appliedRevision 和可选 observations；观测必须声明 effective 来源及 verified/unavailable，verified 必须携带实际 value。进程 appliedRevision 与请求一致不能证明任一字段生效；observations.value 与请求不一致时原样保留差异，缺失 revision/observations 保持未知。凭据操作只返回 ref/configured/source/writable。扩展管理使用实际 service response；进度来自进程级 `config/extensions/update`，不伪造 session。扩展设置 CAS 使用 `ns`、数字 `expectedRevision`、`set/unset` 路径数组，并保留实际持久化/应用/读回证据；运行 form 消失或 effective value 不匹配时，null/unavailable 原样传递，不能以请求值补全。`SETTINGS_CONFLICT` 仅转为固定安全冲突错误。
- Permission preset 使用 catalog/current/defaultPreset；Plan 使用 active/pending/disposition，二者不混用。Todos 使用原生 snapshot，todo-index ID 不代表原生持久标识。
- Jobs 的 owner 必须精确匹配请求会话；拒绝 foreign/unowned Jobs。read/readAt 保留 chunks/lossy/next/result，wait 与 kill 保留真实终态或 requested disposition，绝不把请求接受当作完成。
- Terminal DTO 对齐安装的公开类型：spawn(type/name/cwd)、read(offset/count)、send(text/submit)、signal 五个允许的 POSIX 信号、kill(reason)。timeout 只是 waitReason，不等同 PTY 已退出。
- 重连证明始终绑定同一 lease：当前能力读回确认 absent 才跳过不存在的 Jobs/terminal/subagents/Goal，握手旧 `present:false` 不作为跳过证据。每会话前后都读 `session/goal`；armed 或不可确认状态阻止 stop/cancel，null 或合法 disarmed 的 paused/complete 才可继续。最终重新读取能力及非负 process-local `revision`，composition/服务 identity 改变时拒绝本次重连，即使方法 flags 相同。新 readback 协议缺失/非法 revision 不能当成功证明。终端服务存在但 list 不可用仍阻止重连，空 backends 不等于无现存 PTY；广告 `terminal.activity` 时要求完整 list 响应的 active 布尔值，包含尚未发布到列表的 spawn 活动，active=true 阻止重连。
- 子会话仅返回真实 catalog/status/activity，显式 cancel 由 Native 再次验证父子权限。重新连接要求 child activity 明确 inactive；idle 或终态显示词不能独自证明无排队/外部工作。
- `canContinueSessionSubagent` 在捕获的 owner lease 上读取 `control/capabilities` 的原始 `subagents.prompt`；缺失 flag 为 false，读回失败仍是错误，不伪造为服务不存在。该可选能力不改变共享 `dshNativeControlCapabilities` 解析器或设置页既有快照形状。
- `continueSessionSubagent` 发送客户端铸造的 UUID、直属 child ID、明确 queue/steer 与单一 text part（非空、最多65536字符）。桥端先证实直属 catalog 所有权及 `continuable` mode，再调用公开 SubagentRuntime.prompt；one-shot/external/unknown 拒绝。接收 `{messageId}` 只证明 inbox 已接受，不代表执行完毕；lease 过期或关闭后不能采纳迟到凭证。
- 子会话续接只保留六种官方 `subagent/*` 失败码；桥端不透传原生 message/data。`DshSubagentContinuationError.failureCode` 承载该白名单域错误，基类仍为 `code: failed`，不扩大其他 Native 控制的错误行为。图片附件续接尚未开放，不接受伪造 attachment ref、任意 path 或 URL。
- MCP 只消费挂载/工具/状态证据；connected:null 或缺失状态保持 unknown，不借用声明数据伪造已连接。

## 事件与清理

`subscribe` 提供 session/configuration/extension/busy/invalidated 判别事件；`subscribeTodos` 提供现有 `{sessionID,todos}` 合同。实际 owner session 更新可在空闲时被观察。Jobs 输出通知保持 owner fence，坏结构忽略。扩展进度仅允许当前能力对应操作、固定 event kind 和有界脱敏 metadata。observer dispose 单独移除订阅；adapter dispose 清空所有观察者。断连只发布 invalidated，消费者可在新连接后重新读取，旧 client callback 被 adapter generation fence 阻断。

## 验证与限制

`DshAdapter.reconnectQuiescence.test.ts` 锁定 active/armed Goal、缺失/矛盾 presence、实际无 terminal profile、已保存新 revision 但旧进程读回、composition 更改、扩展后动态能力和迟到 snapshot 回归。`tests/unit/core/agents/backend/DshAdapter.nativeControls.test.ts` 使用 createClient fixtures 验证 ACP/能力降级、generation 失效、真实读回、凭据脱敏、权限/Plan、Todo/Job 事件、Jobs owner、terminal 参数、MCP unknown、配置 revision/显式重连和 active/unknown child 拒绝重连。既有 DshAdapter 与 features 套件保留模型/effort/Goal/fork/steer/aux 行为。

`DshSubagentContinuation.test.ts` 验证专用能力探测、queue/steer 地址与唯一请求身份、域失败／坏凭证、ACP 拒绝、输入边界及迟到 lease 失效；相邻 `DshNativeControls.test.mjs` 验证桥端直属权限、不可续接模式、text-only admission、错误脱敏和关闭取消。合成服务／消息不使用用户配置或发出模型请求。

`DshNativeControlRuntime.test.ts` 把相邻 Node 行为与安装包探针接入默认 Jest 门禁；直接执行 `node --test DshNativeControls.test.mjs DshNativeControls.installed.test.mjs` 可查看细分证据。安装包探针接受 `DSH_PUBLIC_INSTALL`，无对应公共安装时明确 skip，不能据此宣称真实运行已验收。本机探针覆盖真实 SettingsForms／ConfigEditor 写入、回读与 native 重启恢复、NDJSON、跨块／分页秘密脱敏和源字节游标；不用用户凭据／profile，不发模型请求。原生服务本体在 `assets/dsh/control.mjs` 与 `service.mjs`，沿用现有构建内联方式。

Fixture 只能证明 host 合同；真实模型、产品入口与 UI 操作仍需另外验收。服务未证明 child inactive 时会保守拒绝重连。MCP 远端连接和货币／配额没有公开确认源时保持未知。
