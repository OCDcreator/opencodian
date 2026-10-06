# 2026-10-06 macOS 后端主路径验收范围

本次 1.1.37 汇总独立工作树的定向修复和 macOS 实机验收。下表仅表示所列路径闭合，不代表各后端完整 profiles、完整六后端矩阵或 Windows 验收通过。

| 后端 | 已验证路径 | 本次产品改动 |
| --- | --- | --- |
| Pi current SDK | 输入区模型/effort 选择、设置往返、两会话独立保存与重载恢复 | 逐模型 thinking levels、继承文案、会话选择持久化 |
| Codex app-server | 消息前 fork、定位同一 child、恢复续聊、重载、未知/外来 identity 拒绝 | 原生 item/turn 身份、beforeTurnId、目录引用、逐发送模型；清理缓存与 steering 身份歧义防护 |
| Claude Code | 外部 CLI 选择、新建持久会话、重载恢复、切换后显式重启；invalid new/restart/probe 拒绝 | 当前 executable/env/shell 解析与快照、await 后复验、重启前验证及失败提示 |
| ZCode 桌面内置安装 | 项目插件 off/on 下实际技能加载失败/成功；重载恢复同 native 会话且旧历史前缀保持 | 保存结果说明区分有效目录、会话应用和插件执行 |
| OpenCode 2 local-native | 2.0.23 本地服务、两次真实 UI 聊天、同 native 会话重载恢复、错误密码拒绝 | 无永久补丁，现有适配器在正确 executable 条件下通过 |
| OpenCode 1 legacy HTTP/SSE | 审计包中实际 HTTP prompt_async 与 /event reader、两次 UI 聊天和同 session 恢复 | 无永久补丁，隔离库审计 flags 已撤回 |

证据按各自构建身份保留：Pi `HEAD.202610051650`；Codex 分阶段 fork/目录/最终恢复，最终实机 `HEAD.202610052137`，合并补修另经回归；Claude 三回合 `CLAUDE.202610052335` 与主路径不变的最终加载包；ZCode 前两次沿旧包，`ZCODE.20261006.final1` 另验恢复和执行；OpenCode 2 `OC2.20261006.local-native1`；OpenCode 1 两次 legacy 回合属于审计包，普通 rollout 包只确认恢复加载。版本发布不将它们改标为发行包重新执行的模型回合。

仍未闭合：完整 backend/profile/platform 矩阵、当前 Windows 路径、各兼容/fallback/remote 与 auxiliary 全量验收。Pi 第二会话 provider wire/隐藏预算与完整 B11 权限/规划条件、Codex 远端 provider effective 模型、Claude 有效 SetModel effective/第二 CLI 版本、ZCode hooks/MCP 等已注明能力边界保留。OpenCode 2 当前既有受保护 listener 的 HTTP 401 与历史实例关联未关闭；它与 owned 本地服务通过、历史 provider 401 是不同结论。

原多后端工作树的未采纳补丁与旧验收账本保留，不进入本次发行，不因局部通过提升整组状态。用户全局凭据没有随包复制。
