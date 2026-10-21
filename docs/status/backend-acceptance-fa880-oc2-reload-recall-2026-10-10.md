# FA880 OpenCode 2 remote 重载恢复与回忆验收（2026-10-10）

本包 **PASS**，只闭合 OpenCode 2 remote / FA880 / win32 的 B01、B12 下列有限子条件。没有晋升完整 case/profile，没有新增源码修改、构建、部署或完整 verify；未操作标准 Test Vault、desktop-gs1a9np 或其它后端验收。

## 身份与既有证据复用

- 执行工作树：`/Users/dht/.codex/worktrees/opencodian-remaining-acceptance/opencodian`，分支 `codex/opencodian-remaining-acceptance-1006`；实测 HEAD `e9b3a324aa2f911d5589092a8c616abb6497ea94`，运行源码提交 `60350ea2735371d188c3f1b04290b5762abb508f`。两者仅交接文档差分。
- 固定候选：`REMAINDER.20261009.clauderestore1` / 1.1.37；`main.js` SHA256 `3f60a4f6c63aea1a3665c09dd7c6b851f9981a1f6f32cdd6a8c733280a0a6142`。准备时 2,842 个冻结源文件及 123 个 dist 产物逐项匹配，FA880 磁盘和加载 BUILD_ID 一致，故未重建或复制。既有 2026-10-09 verify 的 986 suites / 10,330 tests 作为历史验证复用，本批未复跑。
- 实际 host：`FA880 / letain / 192.168.31.252`；隔离 vault 为 `C:/Users/letain/AppData/Local/OpenCodianAcceptance/remaining-20261007-fa880/vault`，原 profile 的 CDP 为 9238。
- profile：production remote client → 手动 owned OpenCode 2 服务，CLI/service 2.0.24；旧 `16940` 是服务 PID，并非端口，实际端口为 4297。旧服务开始时已退出；本批复用原 executable/config/env/auth 和数据库启动 PID 8240。
- 模型路由：原 `opencode-go` 配置的 `http://192.168.31.147:8317/v1`，未换 provider/凭据。首次只读目录目标为空，第二次只读回查返回 42 个模型且目标可用；这两次读取没有消耗发送预算。

旧首轮证据保留 `REMAINDER.20261009.composer1` 身份，入口仍为原账本的 `NB-FA880-OC2-MAIN1` / `WP-FA880-OC2-ENV` 和 `oc2-main-v6-actual-turn-restoration-coordinator.json`。本包追加恢复与回忆，未重跑旧生成回合。

## 本批实测

| 子条件 | 新证据与结论 |
| --- | --- |
| B01：关闭/重开 view、插件重载、History 同 native 恢复并回忆 | 真实 CDP Input 关闭 view 后 leaf=0，旧 view 事件/子对象清零；ribbon 重开得到新 view。Settings 插件开关执行一次完整 UI unload/load，旧实例卸载、命令移除，新实例加载同固定候选。正常 UI 临时切到 OC2 后端，并显式从 History 选择指定旧会话。 |
| B01：唯一对象与一次发送 | 发送前即时核对 `conv-1791528744638-o61olipfr` / `opencode2` / `ses_ee090c948ffenKj2mAqVn89bT1` / `opencode-go/gpt-5.6-luna` 与 active leaf。一次真实 UI Send、一次 SDK prompt、零 retry；未新建 conversation/native。 |
| B01：request/native/UI 对应 | 插件 dispatch 的 provider/model 准确；SDK prompt 实际仅含 sessionID/text，沿用已恢复 native 的模型。admission `msg_12487d91e001CXEZ7LrK7qtPqx`，assistant `msg_12487d947001fUotjxA5h4FxL5`。native 公布 `opencode-go/gpt-5.6-luna/default`，finish=stop、completed、execution.succeeded，UI 新回复可见并正确回忆 `OC_FA_OC2D_P1_8N4`。不据此推断服务内部的物理上游模型映射。 |
| B01：历史与数据范围 | 无答案提示；contextItems=0、附件=0、工具调用=0。旧四条 native 事件 JSON 前缀精确不变，SHA256 `b533993f3a89cc169c0b469258e1573d70f26cd4c0b84a9eac0cabc5fead4956`，分页核验完整；新增 date system/user/assistant/idle，唯一新增系统来源为 `core/date`。 |
| B12：可观测卸载与外部服务隔离 | 旧插件 events/children 清零、命令移除；新插件 events=42、children=0。外部 owned 服务 PID 8240 在 view 关闭和完整 UI unload/load 后均存活。结束时 OC2 client/process/turns/handlers 均释放。 |
| B12：恢复与本批清理 | 原 Pi conversation/native、三标签顺序/选择/model/context、草稿和布局语义恢复；53 个非目标完整 conversation 对象的逐项 SHA256 全一致。目标旧两条 host 消息前缀保留，真实新增 user/assistant 保留。只结束本批 PID 8240 与 SSH forward PID 25692，4297/19338 无监听；原 9238/24636 和其它 9244/9396 profile 保留。 |

恢复配置阶段另执行了一次 API disable/save-owned-subtrees/enable；它属于恢复操作，不是再次验收或重发。settings 不宣称逐字恢复：标签 runtime ID 重建，后台 `pluginUpdateState.lastCheckAt` 从 `1791600068078` 更新为 `1791614511063`，新状态保留，未整份覆盖。观测函数恢复，临时观测 global 清除。完整私有基线为目录 0700、文件 0600，没有进入 Git。

## 证据与边界

本批证据根：`/Users/dht/.codex/visualizations/2026/10/10/01a1246f-b493-70f1-9a8c-df6acc2b517a/fa880-oc2-reload-recall`。

- 身份/固定候选：`host-identity.json`、`source-candidate-reuse.json`。
- UI 生命周期/History：`view-closed.json`、`view-reopened.json`、`plugin-disabled.json`、`plugin-enabled.json`、`history-restored-target.json`。
- 即时身份/request/native/可见回复：`send-immediate-identity.json`、`send-observed.json`、`terminal-evidence.json`、`ui-after-answer.png`；主代理独立复算见 `coordinator-terminal-recheck.json`。
- 恢复/隔离：`non-target-conversation-hash-manifest.json`、`restoration-semantic-diff.json`、`settings-semantic-diff-safe.json`、`cleanup-owned.json`、`os-final.json`、`forward-cleanup.json`。
- QA 完整结果：`qa-result.json`、`qa-report.md`；独立只读审查：`independent-review.json`。

local-native 插件 CLI 启动、Aux/editor、完整 B01/B12 的故障/资源矩阵、vault 切换、不可观测的全部 heap/OS handle 统计，以及其它 backend/profile/platform 继续保留未验。B01 首轮新建/生成仍是旧候选的既有证据，不改写成当前候选的新实测。本批发送预算已用完，QA 完成后停止；推送、合并与发布不在本批范围内。

QA 执行窗口为北京时间 2026-10-10 14:11:42–14:47:57，约 36 分钟，最终本地交付在九十分钟上限内完成。
