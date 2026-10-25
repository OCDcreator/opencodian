# DSH 原生接入与验证（2026-10-24）

默认接入现为 **原生运行时**，保留显式 **ACP 兼容模式**。本轮接入图片、历史投影与分叉、命令、工具目录、问题、空闲会话 MCP 应用和经真实只读审计的行内编辑/补全。未把未暴露的管理接口或未经实机验证的平台算作完成。

最终构建：`main.202610250207`，插件版本保持 `2.0.2`。macOS Test Vault 已部署并重载，运行时 BUILD_ID 一致；`main.js`、`manifest.json`、`styles.css` 与 dist 的 SHA-256 一致，同时复制 dist/assets。未提交、推送或发布。

## 图片与“握手失败”的根因

两次隔离的真实 ACP 初始化都成功，没有发送模型请求。原配置使用旧模型 ID `deepseek-v4-flash`，而本机 0.2.1-rc.2 目录中具备 image modality 的是 `deepseek-flash`。旧 ID 进入未知模型的 text-only 元数据分支，初始化返回 `image:false`；仅以临时启动 overlay 改正默认模型便返回 `image:true`。ACP 又只在 initialize 时计算一次该标记，随后切换模型不会重新开放图片。

因此此前“握手失败”或据此判断 DSH 不支持图片的结论不成立。正式原生通道按所选模型的元数据和原生附件服务处理图片，绕开 ACP 固定能力标记的限制。证据：`acp-image-comparison.json` 及对应隔离进程记录。

## 接入方式与边界

`DshNativeClient` 复用现有有界 JSON-RPC 子进程传输，启动插件自有扩展 `assets/dsh/service.mjs`。官方 Harness 包仍来自用户安装，使用 SDK composition 和原生 services，不修改安装包，也不连接桌面端私有 Web host。

裸 SDK stdio 表面同样缺少完整历史/目录/交互管理，因此采用原生运行时扩展，而非简单替换为裸 SDK。扩展必须回读 `opencodian.dsh-native/1`，失败时明确报错，不静默回退到功能较少的 ACP。

官方 CLI prepareProfile 会重写所选 profile 根配置。`launcher.mjs` 使用私有 profile 快照承接这些写入，读取已有 SDK bundles、用户 patch 和模块目录；相对插件路径按原 patch 目录解析。原用户 SDK 文件不被重写。停止仅 unlink 明确自有文件/链接，再 rmdir 空目录；不递归删除临时根。

## 能力与证据

| 功能 | 实现与验证 |
| --- | --- |
| 模型、推理强度 | 保留原生 opaque provider/model 值；聊天选择按会话保存，发送前等待原生确认。实际图片回合回读模型 `["deepseek-official","deepseek-flash"]`、effort `off`。不据显示名推断物理上游。 |
| 图片 | 真实 Vault 选择器 → 图片字节 → 原生 prompt → `Red`；原生历史保留 image block。分叉、恢复、重载后继续询问原图右侧，最终构建回答 `Blue`。图片型 file URL 在 Vault 内经符号链接检查和有界读取，不作为空附件或纯路径发送。 |
| 历史与分叉 | 原生事件投影保留消息 ID、图片和工具结果，过滤规则/技能目录/runtime context 等内部注入。实际浏览器预览、原生分叉、恢复至新聊天及续接通过；最终预览有两条真实对话且无内部规则。 |
| MCP | stdio 与 streamable HTTP 实际 initialize/tools/list、热替换和自有子进程退出通过。设置页可保存声明并显式应用至已打开的空闲会话；运行回合拒绝应用。没有将保存声明当作在线状态，也未声明通用 OAuth 管理能力。 |
| 命令与工具 | 读取原生命令/工具目录；斜杠交给 DSH commands，不经 OpenCode resolver。真实自有命令、带 memory 前缀的 slash、普通 Agent 写工具阳性对照通过。 |
| 问题与权限 | 反向 JSON-RPC 支持字符串 ID，绑定原子进程。真实问题回答/取消通过；权限回包有确定性回归，本轮未单独完成真实权限卡片 allow/reject 的 UI 闭环。 |
| 上下文 | 原生 aggregate used/size 投影到聊天占用和详情；实际 UI 显示占用。未知分类、缓存写入和费用仍标为未知。 |
| 行内编辑 | 原生 LLM 辅助查询不创建 Agent、工具调度器或持久会话。实际预览前笔记未变，点击接受只替换选区，单次撤销恢复原文。 |
| 行内补全 | 共享池保留 DSH 模型身份，原生低延迟 effort；实际出现 `Paris.` ghost，文档未变，Tab 接受后写入，单次撤销恢复。 |

行内验收通过注册命令的内部调用打开/触发，指令输入、提交、接受、Tab 和撤销使用真实输入；不将该证据称为未绑定热键的验收。历史浏览首次出现于已有的独立设置窗口，随后明确选择该目标验收；额外打开的 QA 模态均已关闭。

## 只读审计

`AUDIT_AUX_MODEL_DSH=deepseek-official/deepseek-flash node scripts/audit/run-aux-query-audit.mjs dsh` 使用真实安装、凭据、模型和传输，八项检查通过：普通 Agent 实际写文件的阳性对照、工具空集构造、诱导写入、原生请求证明、真实图片、取消、释放/会话身份和文件残留。

辅助通道直接使用 native LLM，不创建聊天 Agent 或调用工具执行循环。图片通过内存 store 交给官方 DeepSeek 适配器；原生会话/图片存储在辅助请求前后未变。创建时校验系统提示词 hash、空 effectiveTools、无 persistence/dispatcher，每次结果再次校验；不依靠提示词限制或自动拒绝权限冒充只读证明。

真实审计见 `aux-audit-private-launch.log` 与 `native-aux-audit-3dLCcj/report.json`。首次失败和后续修复记录保留，未删除失败证据。

## 构建归属与检查

- 最终 `npm run verify` 全部通过：1001 个套件、10728 个测试通过；默认跳过的两个真实协议套件另行执行，5 个测试全部通过，零模型请求。
- lint 零错误/零告警；typecheck、模块覆盖与变更文档、owner、依赖方向/循环、Graphify freshness、开发日志顺序、生产构建和生成 CSS 检查通过。
- 已刷新 src Graphify，执行 CodeGraph 有限深度 callers/impact、最终 sync 和 affected；没有从图结果虚构风险等级。
- 一轮全量曾有 owner-boundaries 测试工作进程 SIGSEGV；该套件单独 7 项通过，之后完整 verify 通过。保留失败日志，不把进程崩溃当作修复通过。

图片上传、行内编辑/补全及撤销的真实 UI 证据来自 `main.202610250059`。此后仅修正模型选择器按 dataset 比较 opaque ID，以及历史过滤内部注入和相应类型标注；图片准入、原生服务、辅助查询和行内实现未再改变，因此沿用该范围的证据。最终 `main.202610250207` 另行验证加载身份、模型菜单无新增选择器错误、过滤后的历史/图片/消息 ID、分叉会话恢复及真实 `Blue` 续接。没有把旧构建的请求算成最终构建重新上传。

## 状态恢复

- 测试前 428 份原有会话原字节全部不变；最终 431 份，仅新增 3 份任务自有 QA 会话，保留失败与成功记录。
- 默认后端恢复 `opencode2`，启用列表恢复 `opencode2/codex/pi/zcode`；行内开关和模型/effort 覆盖恢复原值，原有行内编辑为开启、补全为关闭。
- 本次聊天视图和编辑器标签已关闭，独立设置窗口保留；QA 模态和临时全局已清理。
- 自有 DSH 进程退出、私有启动目录移除；运行回合、pending 问题/权限、aux active/running 均为零。没有停止其他原生 DSH 实例。
- 已采集的 6 个原生配置/profile 文件状态不变。QA 图片和已恢复原文的笔记保留在 `DSH Native QA 20261024/`，供复查。

QA 会话：图片修复记录 `conv-1792858319030-y2t4ls9uu`；早期历史投影记录 `conv-1792864362843-7fnyyu1np`；最终干净恢复/续接 `conv-1792865879595-yj2r6dpdz`。原生图片会话 `73a20b98-19f1-4ef9-88fd-5b11c3ed56e0`，分叉会话 `4888e3c9-b5ef-484b-a1c4-3423dfd9252a`。

## 保留边界

Windows 原生运行时未实机验收；当前实际安装版本为 macOS Harness 0.2.1-rc.2。原生持久历史删除、独立终端管理和通用 MCP OAuth 没有在本轮开放；`session/close` 不冒充删除。ACP 兼容模式仍受其原生协议限制，不提供本次原生辅助通道。

本机证据：`.scratch/dsh-native-backend-20261024/` 中的 `verify-delivery-final.log`、`live-delivery-final.log`、`deploy-native.json`、`ui-image-success.json`、`ui-clean-history-preview.json`、`ui-clean-history-restored.json`、`ui-fork-followup.json`、`ui-inline-*.json`、`ui-completion-*.json`、`ui-restoration.json`、`conversations-final.json`、`user-profile-after.json`、模型菜单前后错误快照及截图。原始日志/字节备份仅保留本地，不属于提交内容。
