# 后端版本适配与运行时核验（2026-11-13）

基线：`0a38dbe9b3ee8e106afe1c696f360e020504672d`。用户在六后端更新核查后授权修复并合并、提交和推送。插件版本保持 2.2.0；本次没有版本发布操作。

## 版本

| 组件 | 本次依赖／实装基线 |
| --- | --- |
| Claude Agent SDK | 0.3.323（从 0.3.319 升级） |
| 外部 Claude CLI | 2.1.323 |
| Codex SDK／外部 CLI | 0.169.0 |
| OpenCode 2 client／schema／CLI | 2.3.0；schema 为直接依赖 |
| ZCode 桌面／内嵌 CLI | 3.18.2.10443／0.17.1 |
| Pi 官方 SDK／CLI | 1.5.2，@earendil-works/pi-coding-agent |
| DSH PATH CLI | 0.2.2-rc.1，保留既有原生桥接 |
| 已退役 OpenCode 1 SDK | 1.19.5，保持休眠和历史会话归属 |

独立 worktree 重新安装依赖，避免原目录 node_modules 落后于锁文件。npm 镜像缺少当日版本时只在本次安装命令使用官方 registry，没有修改用户全局 registry。源代码图使用 CI 固定的 graphifyy 0.9.31 本地虚拟环境。

## 已实施的适配

- **ZCode 账号（Z1）**：保留明文／enc:v1，支持官方 enc:v2:env。AES-256-GCM key 是配置 secret 的 SHA-256 原始字节，fingerprint 是该 key 的 SHA-256 十六进制前 24 位；严格检查信封、指纹与认证标签。os 源、未知命名空间和损坏密文保持不可读。独立托管登录根与共享个人 API 配置边界不变；子进程显式清空竞争的 ZCODE_CREDENTIAL_SECRET_FILE。
- **ZCode 历史与删除（Z2、Z4）**：移除加载桌面私有 TaskIndexRepo 的旧桥接，改用官方原生目录与 V4 软删除。保留 workspace／interactive／同 ID 守卫与删除后缺席读回；达到 200 条读取上限时返回带已读行的 partial，不伪造 cursor 或完整性。
- **ZCode 问题收口（Z3）**：userInput.resolved 按 sessionId＋requestId 结算，拒绝迟到回答，不扩展普通权限批准规则。
- **ZCode guarded**：设置类型、归一化、设置选项、聊天选择、双语文案、原生应用与模式读回一致；不替用户改变已有默认值。hostCapabilities 仅有类型化读回，未实现的宿主能力不声明为 true。
- **Claude 权限（A1）**：原生 dontAsk 不再映射为 bypassPermissions，auto 不再降为 default。六个原生模式在设置与聊天一致；危险跳过标志只由显式 bypassPermissions 开启。加载旧 raw dontAsk 的变化只收紧权限。
- **Claude SDK**：使用 0.3.323 的分叉／历史修复；保留 AbortShim。转发官方 deleteSession，在原生身份与 vault scope 内删除并确认同 ID 不再可读。compaction、permission_denied、auth_status、rate_limit 进入既有诊断流；没有据此新建状态 UI，也未把压缩后的绝对用量伪装成增量 usage。
- **Codex 技能（C1）**：两条 skills/list 请求都发送 cwds:[cwd]，保留 forceReload、分组与错误。兼容 beforeTurnId 的 experimentalApi 协商保持有效。
- **Codex 传输与推理流**：独立 app-server 使用每次启动的新能力令牌，argv 只传 SHA-256，令牌通过 WebSocket upgrade header 认证；兼容降级只允许有明确参数不支持证据的旧 CLI。推理 summary 与原始 delta 去重，保留分段身份。已废弃的 thread/compacted 不作为成功证据，继续使用原生 contextCompaction item。
- **OpenCode 2**：采用 @opencode/schema/goal 的真实 Goal.Definition，移除手写 passthrough RPC 定义。Promise client 不执行 schema 校验，既有 BackendGoalRuntime 防御与服务端校验仍然必要。Jest bridge 加载安装包的真实 ESM 定义，不伪造 Goal schema。
- **Pi／旧实现**：遗留 AuthStorage 分支对 getOAuthProviders 做方法存在检测；现代 ModelRuntime 路径不变。旧 OpenCode 注释改为固定官方来源。当前 Claude 工具名归一化进入已有 toolIdentity，不增加执行权限。

## ZCode 原生引导边界

当前 V4 sendText 的 requestedDelivery:guide 只是投递建议：没有 expectedTurnId／activeTurnOnly，sendText 不执行 baseRevision CAS。原活动轮在入站前结束时，可退为下一轮队列或启动新轮；ACK、steerQueued 和撤回 itemMissing 均不证明原轮消费。未知投递时保留本地队列还可能重复发送。因此不开放插件 current-turn-only steering 能力，继续使用已验证的本地队列。该结论经过源码与消费者合同复核，替换旧文档“完全没有原生接缝”的过时表述。自动化、语音与跨会话应用控制属于独立产品范围，没有接入。

## 验证证据

证据保存于本机 tracker 的 `backend-runtime-refresh-20261113/`，不把会话、真实凭据或大份原始日志提交到同步库。

- 官方 ZCode cipher 与插件读回的交叉验证 8/8，覆盖 env:v2、v1、官方迁移、os 不可读、篡改、错密钥、子环境清 FILE 与原生双源拒绝；全为虚构凭据。
- 真实 ZCode 无模型隔离软删除：两个任务会话跨进程重启持久；删除一个后同 ID 列表缺席、resume 返回不存在，另一个仍可恢复。五项断言通过，未读取或删除用户会话。
- 真实 Codex 0.169.0 无模型探针：cwd 被忽略的行为得到复现，cwds 返回请求目录；鉴权 socket 无 header 返回 HTTP 401，带 header 可初始化，argv 只含摘要。新增旧 CLI 模拟器的真实子进程验证覆盖 parser 拒绝、配置错误和 ENOENT 三类分支，只有 parser 证据允许一次无鉴权降级。
- 真实 Claude CLI 2.1.323 的 dontAsk 与 auto 各完成一次空工具、单轮、预算上限的最小请求；两种原生模式均被接受。未把空工具请求当作审批／拒绝或 auto 分类器资格证明。安装 SDK 0.3.323 在隔离 CLAUDE_CONFIG_DIR 中用两个官方格式会话验证 deleteSession 后信息、消息、列表和原始 transcript 均只删除目标 ID，另一会话及真实项目目录保持不变。
- Pi 安装版 1.5.2 经本地 fixture provider 验证配置保存／校验、auth、消息流、持久化、克隆与重载。该证据不是远程付费模型 E2E。
- DSH 安装版原生控制 8 项通过，包括 stdout 隔离、settings reboot 读回、Plan 独立状态与 Jobs readAt。
- CodeGraph 采用官方 SDK 精确 file＋qualifiedName 解析，深度 1，统计排除 file 节点的直接函数／方法调用方；CLI 模糊解析选错同名方法的结果没有采用。动态注册入口的零直接调用方不代表没有运行时消费者。最终 affected 检查另行记录。

## 收口结果

`npm run verify -- --base 0a38dbe9b3ee8e106afe1c696f360e020504672d` 十五项门禁全通过：owner／架构、模块文档与 owner-impact、Graphify、devlog、lint、TypeScript、完整测试、生产构建与生成样式一致性。1,084 个测试套件／12,349 项测试通过；另有 4 个套件／8 项按既有条件跳过；lint 为 0 errors／0 warnings。中间轮次出现的 Goal bridge 与 hoisted fs mock 初始化冲突已修复并由完整测试覆盖；一次 Jest worker SIGSEGV 对应套件隔离复跑与最终全量复跑均通过，没有降低断言或门禁。

构建 `zcode-backend-runtime-refresh-20261113.202611132235` 已分步部署 macOS Test Vault：main.js、manifest.json、styles.css、pdf-engine.js 与 assets 都和 dist 一致。官方 CLI 重载后实际插件 `getDebugBuildIdentityText()` 读回相同 BUILD_ID，版本 2.2.0，vault 名称与物理路径均匹配。部署复制最初被 Mimosa 的直接 shell 写入规则拒绝；改用经 Write 提交扫描、明确固定来源／目标且拒绝 symlink 的任务部署脚本后执行成功，没有更改安全配置。Git 合并／双远端推送与远端 CI 另行记录，不以本地门禁替代。

最终 CodeGraph status／sync 后执行 affected：104 个变更路径，遍历 1,898 个依赖节点，关联 1,062 个测试文件。此为图关联范围，包含文档及共享设置，不是实际发生行为变化的模块数；全量测试已覆盖。未运行 CodeGraph init。

### Standards 独立审查

硬性规范违反 0。两条非阻塞可维护性建议：账号密钥 fallback 重复与 Codex 状态对象重复字面量。前者已合并到同一解析器并保留 configured→process→本机 fallback 优先级；后者不扩大本次改动，继续由类型检查保证字段完整。新增 spawn support 隔离令牌与进程就绪的高风险边界，没有建立通用转发层。

### Spec 独立审查

缺失或错误实现 0。披露两处审计候选之外的加性接入：Claude 官方删除与诊断信号；前者已有隔离真实 SDK 验证，后者只进入既有诊断消费者，不宣称状态 UI 已实现。ZCode guide 保持已审查的不开放决定。两轴结论分别保留，不用规范通过替代需求正确性。

审查计数：Standards 0 个阻塞、2 条非阻塞建议（1 条已落实）；Spec 0 个违反、2 处已披露加性接入。

实机新增验收以 macOS 安装版为范围；Windows、登录资格受限的模型模式、未实际运行的远程模型／图片回合分别保留边界，不将 fixture、协议 ACK 或源码枚举当作其成功证据。
