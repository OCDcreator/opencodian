# DSH 缺口修复（2026-10-25）

对 `docs/status/dsh-integration-2026-10-24.md` 的独立核查确认：报告的硬性声明（构建、测试计数、会话恢复、未提交）全部属实，但发现两项被低估的缺陷（权限卡按钮确定性坏路径、问题卡 UI 应答断路）与若干行为性缺口。本轮在 `zcode/dsh-gap-remediation` 分支修复全部可在插件层修复的项。

## 已修复

| 缺陷 | 修复 |
| --- | --- |
| 权限卡“始终允许/本会话允许”对 DSH 等效拒绝，且会话级 tracker 自动批复会把后续权限静默取消 | `DshAdapter.respondToPermission` 的 `always` 应答优先选 `allow_always` 选项、否则回退 `allow_once`（对齐 zcode 回复映射）；会话/持久记忆由渲染器客户端 tracker 承担。allow 放行路径补齐单测（此前零覆盖） |
| 权限卡 patterns 显示选项名噪声、pending 读取的 permission 字段取首个选项名 | chunk 与 `getPendingPermissions` 的 patterns 改为空数组（DSH 无路径 pattern 语义），permission 统一取 toolCall 标题；`PendingPermission` 保存完整请求 |
| DSH 问题卡 UI 应答路由断路：应答 port 白名单只有 `zcode/opencode2`，dsh 回落到 legacy `openCodeService` 失败 | `OpenCodianView.getQuestionApiForTab` 白名单加入 `dsh`，与权限应答白名单对称；新增路由测试覆盖 dsh/zcode/opencode2/legacy 回退与跨会话拒绝 |
| 10 分钟 prompt 超时把仍在产出事件的合法长回合判为 transport 不确定并杀连接 | `DshAcpClient` 的 prompt 超时改为空闲间隔：`session/prompt` pending 按 sessionId 标记，同会话任何 `session/update` 重置计时；静默卡死仍按原路径恢复 |
| stderr 直接丢弃，启动失败只剩裸退出码 | 8 KiB 有界 stderr 环形缓冲，凭据形态串（sk- key / Bearer / JWT）先脱敏；`recentStderr` getter 供诊断，进程退出/协议失败错误附带最近约 1.5 KiB 尾部；pending 拒绝仍用原始错误保持 transport-uncertain 前缀匹配不变 |
| 上下文占用在断连/恢复后归零 | 最后已知占用快照跨 `clearSessionRuntime` 保留（原生只在下一条助手消息刷新占用） |
| 会话目录 `updatedAt=createdAt`，"按最近更新"排序失真 | `service.mjs` 追踪每会话最后事件时间，`session/list` 优先返回进程内活跃时间，其次 `header.updatedAt`，最后 `createdAt`；同时透传 `createdAt` |
| `getSession()` 缺失导致官方标题轮询、详情、分享检查对 dsh 全返 null | `DshAdapter.getSession` 复用目录分页返回单会话元数据行；`AgentBackendRouting.readBackendSessionTitle` 增加 dsh `.title` 映射，DSH 会话现可读官方标题 |

## 独立复审与第二轮修复（同日）

codex（`gpt-6-astra`，effort=ultra，只读）对 27322547b..d476bb70 做了独立审查：1 项 P1 + 5 项 P2，结论"需修复后合入"。全部发现均核实并修复：

| 发现 | 修复 |
| --- | --- |
| F1 (P1) stderr 脱敏遗漏：小写 `bearer` 不匹配、JWT 头段长度门槛 `{24,}` 放过合法短头 JWT、环形缓冲截断 `sk-` 前缀后残余密钥暴露 | 正则重写：Bearer 大小写无关（RFC 7235）；JWT 改为三段 base64url 形态（头段 ≥10）；缓冲起始位置的 24+ 无空格符号串视为截断残端脱敏（仅缓冲头部，不误伤堆栈中的路径）。补小写 bearer/短头 JWT 反例测试 |
| F2 (P2) 权限卡"始终允许"没有会话记忆：渲染器只在 `session` 时写 tracker，`always` 直接转发，同样请求会重复弹卡；注释与本文档的"持久记忆由 tracker 承担"声明不成立 | 渲染器 `always` 与 `session` 同样写入客户端 tracker（插件会话内即时放行；对有持久化通道的后端只是冗余、不扩大范围）。新增渲染器记忆测试：always 后同工具不再弹卡、once 不记忆 |
| F3 (P2) `always` 未真正优先 `allow_always`：`options.find(kinds.includes)` 按 options 数组顺序，`[allow_once, allow_always]` 排列会选错；首轮测试恰好把 allow_always 放前面掩盖了问题 | 改为按偏好顺序的两段查找（先 `allow_always` 再 `allow_once`）。补反向排列测试 |
| F4 (P2) 启动失败的 stderr 尾部只到 `onProtocolError` 回调，`start()` 抛出的还是原始错误 | `failAll` 与回调同样携带脱敏尾部（后缀追加不破坏前缀锚定的 transport-uncertain 分类）；补 start 拒绝带尾部的断言 |
| F5 (P2) ISO 时间戳没有接通消费路径：`extractTimestamp`/目录归一化只认数字，详情与目录时间字段全为 null | `DshAdapter.listSessions` 在目录边界把 ISO 转毫秒（getSession 自动受益）；补跨路由时间字段断言 |
| F6 (P2) stderr 监听缺子进程身份隔离：重启复用路径上旧子进程迟到输出污染新缓冲 | data 回调增加 `this.child === child` 检查（确定性单测难以稳定构造迟到窗口，依据审查建议以守卫代码与说明记录） |

审查同时确认通过：patterns/permission 字段修正、contextUsage 保留（新会话 randomUUID 无 ID 复用路径）、getSession 分页语义、超时重挂无竞态（同步 pending 表操作）、Questions 路由（ACP 禁用时抛错属预期门控，已补测试）、iso() 回退链。

## 实机验证与第三轮修复（同日晚，Astra 独立验证触发）

codex（gpt-6-astra / ultra / 实机模式）验证揭露了此前"环境性失败"的真相并触发一项生产级修复：

- **装机版本实为 0.2.1-rc.3**（此前记录的 rc.2 已被用户更新）；`~/.dsh/llm-deepseek/files-v3.json` 是附件上传索引（214 条 records），**真实凭据在 `~/.dsh/.credentials.yaml`**。
- **生产级缺陷（已修复）**：凭据存在时 provider 加载并在进程内把 `[llm-deepseek] ...` 日志写到 stdout，污染 JSON-RPC 帧流——`DshAcpClient` 按行解析遇到非 JSON 行即判协议失败杀连接。用户真实环境正是 rc.3+凭据，Test Vault 实跑必中。修复：`service.mjs` 建立通道隔离——`process.stdout.write` 整体改道 stderr（进程内日志保留诊断价值），JSON-RPC 传输独占经原始 fd 的专用 Writable。
- **凭据补种门禁**：`DshNative.live.test.ts` 新增 `DSH_NATIVE_LIVE_CREDENTIALS=<真实 ~/.dsh>` 可选补种（复制 `.credentials.yaml` + llm store 进隔离根）。补种后 native 三探针在本机 **3/3 通过**（含真实模型/工具/命令目录、stdio/HTTP MCP、反向问题），此前记录的"环境性失败"就此闭合。
- 复审第二轮静态反例的再修复：stderr 残端规则去掉 `/`（以路径开头的诊断不再被误脱敏为 `[redacted]`）；JWT 规则锚定 `eyJ`（JOSE 头 base64 形态），点分标识符（如 BUILD_ID、`DshNativeClient.startInternal.launch`）保持可读；权限卡 `always`/`session` 的记忆写入移到后端应答成功之后（应答失败不留过期批准）；`withStderrTail` 改为原地附加 message（保留错误对象的 code/cause/具体类型，EPIPE 断言带 stderr 尾部一并覆盖）。补路径保留、点分保留、失败不记忆、EPIPE code 四条断言。
- 已知既有语义（验证复现，非本轮引入，不改动）：session approval 按 tool+action+patterns 匹配，同工具不同输入共享 always 记忆（opencode/zcode 一直如此，渲染器注释已载明）。Astra 验证特别指出 zcode 的原生 offered response 可能是窄范围规则，渲染器层 always 记忆是会话内工具级——与 opencode 服务端"始终允许=整工具持久"的既有行为对齐，方向一致但宽于个别原生窄规则；作为产品语义接受并在此记录。

验证证据：`.scratch/astra-verify-20261025/`（ACP 探针 2/2、native 凭据补种前后对照、独立边界反例测试、凭据复制清单不含内容）。

## 第五轮：第二轮 Astra 实机复审与本轮处置（同日）

codex（gpt-6-astra / ultra / 实机）对 9c97bd94..ac3eee73 复审，结论"有条件可靠"：实机全部通过（native 3/3、ACP 2/2、真压缩 shadowed 6/4,372 tokens 且二次压缩 1/626、双向 busy 互斥实测、压缩后语境保留三条事实全对、占用降 30.3%、token 明细真实、无锚点诚实降级、连接存活、Test Vault SHA-256 一致）。处置其发现：

- P3 回退：slash host 的 `getDshAdapter` 分支确认为不可达死代码（DSH/zcode 斜杠在 resolver 即转发 raw prompt，`/compact` 由原生命令执行并已实测）——回退三处接线与文档，语义与 zcode 对齐。
- P2 修复：压缩 admission 存入 `record.admission`（`session/cancel` 可中断摘要）；adapter 的 compact 超时（180s）后 best-effort 通知原生取消，避免服务端持续 busy；availability 按 `AgentCapability.Compaction` 门控（ACP 会话不再显示可用入口）。
- P2 记录不改：compactSession 返回 boolean 是跨后端接口惯例（opencode2 同），no-op 与真压缩的区分（shadowed=0）留在原生 `/compact` 命令的官方文案里；UI 压缩结果显示"已受理待验证"与失败折叠为通用文案是共享 ForegroundCompactionAction 行为（zcode 同款），按共享组件改进另行立项。
- P3 文档矛盾修正：本文件"结构受限项"清单移除压缩/token 分类（已在第四轮实施）。
- 测试补齐：compact 测试补 ACP 拒绝断言（验证员指出标题声称但未断言）。

其诚实披露：并行审查子代理因上游 503 未启动（单验证员完成）；静态超预算 40 秒；早期探针临时目录落在 /var/folders 而非 /tmp（已纠正）；未做 Obsidian GUI 点击与 180s 超时实测。证据：`.scratch/astra-verify2-20261025/`。

## 第四轮：能力面实测与 Compaction/费用接入（同日深夜）

回应"是否必须走 ACP"：默认通道本就不是 ACP——原生扩展骑在完整 SDK composition 上，`ctx.get()` 能拿到的服务远多于官方 ACP profile。一次性探针扩展（/tmp，凭据补种）在真实 rc.3 进程内实测：compaction/jobs/subagents/planMode/fs/web/tokenMeter/commands/sessionTitle 全部挂载可用，`/compact`、`/plan` 就在命令目录；todo/goal/workflow/skill/schedule/messageFeedback/authorization/credentials 未挂载，会话删除仍无持久 API（全 SDK 仅内存 Map 清理）——"上游受限"清单据此修正。

已实施（均经真实模型回合验证）：

- **上下文压缩（Compaction）**：service.mjs `session/compact` 直调原生 compaction seam（官方 `/compact` 同源 `compactNow`）；`DshAdapter.compactSession` + 原生模式能力位；view 压缩入口（availability/compactForegroundThread）与 `/compact` 斜杠（host factory `getDshAdapter` 分支）接线。真实验证：三轮长文会话（12,284 tokens）压缩影子化 16 条 / 6,266 tokens，下一回合占用降至 6,946；过小会话被 harness 诚实拒绝（"压不出更小摘要"，官方同语义）。
- **token 分类与费用估算**：真实回合后 meter 锚定模型上报 usage，`usage_update` 附带 input/output/cacheRead/cacheWrite（实测 input 388 / output 2,421 / cacheRead 5,376）；快照 `tokenBreakdownAvailable:true`，`providerId` 置 null（harness 配置组是显示名）、真实模型 id 从 opaque 选择解码；`inferProviderId` 增加 `deepseek*` 前缀分支（与 claude/gpt 同构），models.dev 估算链路打通。
- 服务面探针同时确认 **jobs/subagents/planMode 可用但本轮未接**（jobs 面板消费接口为 zcode 专用形状，接入待立项；planMode/`/plan` 命令用户已可用原生斜杠）。

## 评估后保持现状的项（非缺陷）

- **ACP 兼容模式 tools/commands 返回空数组**：这是 ACP 斜杠发送降级路径的一部分——抛错会打断把斜杠当普通 prompt 发送的回退。与 title/fork/aux 的 native-only 显式报错不同风格是有意的：前者是可用性降级，后者是能力缺失。
- **子代理事件投影**：子代理以父 agent 的工具调用形态出现在转录中（tool_call/tool_result 已投影）；在通用卡片流中内联子代理内部事件需要 harness 提供父子事件关联语义，未擅自合成。
- **fork 返回空 title / createSession 忽略 title 参数**：Harness 自行生成官方标题，插件侧强制写入本地化默认标题会覆盖官方标题生成。标题经新增的官方标题轮询通道自然到达。
- **native `session/command` 与 `aux/state` 不接产品面**：斜杠执行走 `session/prompt` rawText 路径以保留图片附件（`session/command` 不支持附件）；`aux/state` 仅审计脚本消费。

## 结构受限项（需 Harness 侧支持，本轮不实施）

原生持久历史删除（全 SDK 无持久删除 API）、MCP OAuth 与服务器状态管理、独立终端管理、后台任务面板（jobs/subagents 服务已探明挂载可用，接入待立项）、todo/goal/workflow/skill/schedule、Windows 实机验收（win32 仅 PATH `dsh.exe`，`.cmd/.bat` 显式拒绝）。上下文压缩与费用/token 分类已在第四轮实施并实机验证（见上）。DSH session trace 服务（对标 Claude/Codex 三套 wire 级 trace）为后续工作，本轮以 stderr 捕获先解决急性观测缺口。

## 验证

- 新增测试：权限 always 回退/持久选项优先/once 放行、permission chunk patterns 与标题字段、`getSession` 目录缝、占用快照跨恢复保留、prompt 空闲超时重置与静默超时、stderr 尾部脱敏、问题卡路由（dsh/zcode/legacy/跨会话拒绝）。
- `npm run verify` 全部 15 项门禁 PASS（change scope、owner manifest/boundaries、依赖方向/循环/审批、module docs、graphify freshness、devlog order、lint 零告警、typecheck、全量测试、生产构建、生成 CSS）。全量测试 1002 套件 / 10738 项通过（基线 10728 + 新增 10），5 项真实协议套件默认跳过另行执行。
- 真实协议探针：`DshAdapter.live.test.ts` 2 项通过（自有 stdio MCP 服务器挂载/退出、隔离会话创建/列表/关闭/恢复，均经本轮修改的传输层子进程）。`DshNative.live.test.ts` 3 项在当前本机环境失败：隔离 HOME 下 Harness `initialize` 报 `Harness has no available model provider`；**同一失败复现于未修改的 checkpoint 基线（zcode/dsh-native-integration @27322547b）**，属环境/上游变化（用户侧 provider 目录在隔离 DSH_HOME 下不可见），与本轮代码无关。原生运行时行为（超时重置、stderr 尾部、session/list 时间戳）因此只有单测级验证，待环境恢复后须重跑 native 探针与真实回合冒烟。
- 最终构建 BUILD_ID：`zcode-dsh-gap-remediation.202610251422`（插件版本保持 `2.0.2`）。
- 更新（第三轮后）：上述"待环境恢复重跑 native 探针"已闭合——`DSH_NATIVE_LIVE_CREDENTIALS` 补种 + stdout 通道隔离修复后，native 三探针在装机 rc.3 上 3/3 通过；最终构建 BUILD_ID 见部署记录。
