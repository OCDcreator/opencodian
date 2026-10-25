# DSH ACP 兼容模式能力扩展调研（2026-10-25）

结论先行：**ACP 模式能力少的根因不在插件客户端，而在装机 DeepSeek Harness 的官方 ACP profile 实现面。** 实测握手只声明 `sessionCapabilities: { close, list, resume }`、`mcpCapabilities.http` 与 Session Config Options；ACP v1 规范中其余能力（斜杠命令目录、会话模式、Agent Plan、fs 读写、终端、session/delete、elicitation）DSH 侧均未实现。短期内可做的是三件小事（见"建议"），能力面的实质扩张只有上游实现或继续以原生通道为默认两条路。

## 实测证据（2026-10-25，Harness 0.2.1-rc.2 Desktop）

隔离 HOME 下用桌面载体启动官方 `--profile acp`，零模型请求探针（`/tmp/dsh-acp-capability-probe.mjs`）：

```
initialize → agentCapabilities: {
  mcpCapabilities: { http: true },
  promptCapabilities: { image: false, audio: false, embeddedContext: false },
  sessionCapabilities: { close: {}, list: {}, resume: {} } }
session/new → { sessionId, configOptions }   // 无 modes、无命令目录；configOptions 带 category: model / thought_level
2.5s 空闲期 session/update 通知：零（无 available_commands_update / current_mode_update）
session/list → 正常（隔离 HOME 计数为 0）
prompt "/help" → 直接进 LLM 路由并因隔离环境无 API key 失败——官方 ACP 不拦截斜杠命令
```

该失败同时解释了 native live 探针的环境性失败：错误文案明确指引"凭据服务（web Models 页写入）或导出 DEEPSEEK_API_KEY"——隔离 DSH_HOME 拿不到用户凭据。恢复 native 探针的路径是把凭据 fixture 注入隔离根或导出密钥，与代码无关。

## ACP v1 规范面 vs DSH 实现面 vs 我方消费面

| ACP v1 规范能力 | 规范形态 | 装机 DSH ACP | 插件现状 |
| --- | --- | --- | --- |
| 会话生命周期 new/prompt/cancel | 基础方法 | ✅ | ✅ 消费 |
| session/list / close / resume | `sessionCapabilities.*` | ✅ 三项全声明 | ✅ 消费（目录分页、close 清句柄、resume 恢复） |
| Session Config Options | `session/set_config_option`，带 `category`（model/thought_level，RFD model-config-category 已并入） | ✅（model + reasoning_effort） | ✅ 消费（仅按 select 处理；boolean/config-category 扩展见建议 3） |
| 图片 prompt | `promptCapabilities.image` | ✅ 声明（随目录计算，隔离下 false） | ✅ 消费（握手门 + 原生按模型确认） |
| MCP 声明（stdio + http） | `session/new` 携带；`mcpCapabilities.http` 区分 | ✅（live 探针实证 stdio 挂载/退出） | ✅ 消费 |
| 权限请求 | `session/request_permission`，选项 kind allow_once/allow_always/reject_once/reject_always | 未见声明字段（按需反向请求） | ✅ 消费（上周修复 always 回退） |
| 斜杠命令目录 | `available_commands_update` 通知 + `/cmd` 走 prompt | ❌ 空闲期零通知，`/help` 直落 LLM | 目录在 ACP 模式返回空（原生模式走 `session/commands`） |
| 会话模式 | `session/set_mode` + `current_mode_update` + session/new 返回 `modes`；规范注明将被 Config Options 取代 | ❌ 无 modes 字段、无通知 | 未消费（原生用 reasoning_effort 配置项覆盖同层需求） |
| Agent Plan | `sessionUpdate: "plan"`，entries[{content,priority,status}] 全量替换 | ❌ 未观测到 | 未消费 |
| fs 读写（client 侧能力） | client 声明 `fs.readTextFile/writeTextFile` → agent 反向 `fs/read_text_file`、`fs/write_text_file` | ❌ 未声明 | ❌ 有意不声明（见建议 4） |
| 终端 | agent→client 终端执行面（v1） | ❌ 未声明 | ❌（全后端一致无终端） |
| session/delete | `sessionCapabilities.delete` | ❌ 未声明 | deleteSession 显式报不支持（正确） |
| Elicitation（用户问答/URL 授权） | client 声明 `elicitation.{form,url}` → agent 反向 `elicitation/create` | ❌ authMethods 空、未声明 | 问题卡走 DSH 自有 `session/request_question`（原生实证） |
| audio / embeddedContext prompt | `promptCapabilities.*` | 声明为 false | 仅读 image 字段（audio/embeddedContext 未解析，见建议 3） |

RFD 草案阶段（规范在跟、上游更没有）：`session-fork`、`session-compaction`、`session-usage`、`subagents`、`mcp-over-acp`、`session-notices`、`get-auth-state`、`session-info-update` 等。**原生扩展 `opencodian.dsh-native/1` 自实现的 fork/usage/MCP-apply/子进程等待，恰好就是这些仍在草案的能力**——原生通道继续作为默认是正确路线，而非权宜。

## 建议

1. **能力面实质扩张只有两条路**：(a) 上游——向 DeepSeek 跟进 ACP profile 实现 `sessionCapabilities.delete`、`available_commands_update`、modes、plan、elicitation。规范已定义，上游一旦实现，客户端接入成本低（delete 一个能力位判断 + 方法调用；命令目录一条通知映射）。(b) 继续把投入放在原生通道（默认模式），ACP 保持"兼容底线"定位。**不建议**为 ACP 模式单独开发模拟层。
2. **可先行的零风险客户端准备**：`DshAcpClient.handleMessage` 把 `available_commands_update` / `current_mode_update` / `plan` 三类 update 转发给 adapter（现在它们被静默丢弃）；adapter 侧目录缓存接到 `getRuntimeCommands`。对当前上游零行为变化（上游不发），上游一旦实现即刻生效，两模式共用。
3. **小步对齐规范新字段**：解析 `promptCapabilities.audio/embeddedContext`（当前只读 image）与 configOptions 的 `category`/boolean 类型（当前只认 select），为上游演进留缝。
4. **明确不做**：声明 client `fs` 能力或终端能力——会让 agent 经反向请求直读/直写 Vault 文件，绕开行内编辑 fail-closed 的只读证明链与唯一写路径约束，属于产品红线而非能力缺失。
5. **恢复 native 探针**：向隔离根注入凭据 fixture 或导出 `DEEPSEEK_API_KEY` 后重跑 `RUN_DSH_NATIVE_LIVE=1` 三探针与真实回合冒烟（见 dsh-gap-remediation 状态文档的待办）。

探针脚本与原始输出保留在 `/tmp/dsh-acp-capability-probe.mjs`（临时，不入库）。
