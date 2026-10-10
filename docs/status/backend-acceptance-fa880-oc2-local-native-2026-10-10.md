# FA880 OpenCode 2 local-native 限定验收（2026-10-10）

本批结论为 **LIMITED FAIL（证据完整性）**。插件实际启动所选 CLI、两轮真实 UI 聊天、关闭/重开 view、完整插件重载后同 native 的自动恢复与首轮标记回忆，均取得实际成功证据。首轮原请求 envelope、History 实际执行恢复的动作、自动 aux 请求/native 数量仍未证明，因此不能将本工作包或完整 profile 记为 PASS。已完成恢复后停止实机操作，无补发或自动续跑。

## 源与候选复用

- 续接工作树：`/Users/dht/.codex/worktrees/opencodian-remaining-acceptance/opencodian`，分支 `codex/opencodian-remaining-acceptance-1006`，本批开始 HEAD `e504bbb0368acd7e86c10e5c2e59fe7a9cc5429e`。
- runtime source：`60350ea2735371d188c3f1b04290b5762abb508f`。其后两个提交仅改文档；本批没有源码修改、build、verify 或部署。
- 候选 `REMAINDER.20261009.clauderestore1` / 1.1.37；main SHA256 `3f60a4f6c63aea1a3665c09dd7c6b851f9981a1f6f32cdd6a8c733280a0a6142`。冻结 2842 文件、固定候选与工作树 dist 各 123 产物均匹配，磁盘与 loaded 候选核对一致。
- 复用原 verify：15 项门禁、986 suites / 10,330 tests，记录 exit 0；这是原验证的复用，没有宣称本批重跑。旧日志内容包括原 Git fatal 行，原件保留。

## 本次真实启动及两轮执行

宿主仅 FA880 / letain / 192.168.31.252。实际加载的隔离 vault 为 `C:/Users/letain/AppData/Local/OpenCodianAcceptance/remaining-20261007-fa880/vault`，Obsidian 1.14.4，原 profile/CDP 9238；未使用旧 148 或标准 Test Vault。

正常 Settings UI 选择 Local server，保留并核验原显式 CLI 字段，再由正常新聊天/catalog 触发 `_OpenCode2Adapter.connect → spawn`。CLI 路径为 `…/opencode2-local-native-20261009/runtime 配置/opencode.exe`，版本 2.0.24，SHA256 `542c51f075026e1dbd5b676ebce685d0b454face48872b0813d08f867e2c4eaa`。argv 为 `serve --stdio --hostname 127.0.0.1 --port 0 --cors app://obsidian.md`。首主 PID 26116 / 父 renderer 22716 / loopback 5679，与生产调用、系统进程、监听和握手相符；没有手动 serve、adoption 或切 remote。重载生产路径启动主 PID 22652 / loopback 9009；该第二主运行时 OS parent/创建时间未捕获，只有 production 调用、child PID 和握手观测。两主 cwd、私有 config/home/data 根和 `OPENCODE_DB=…/data/opencode/local-native.db` 均一致。

有效 normalized Windows directory scope 回读为 HTTP 200，provider 仍为已授权 `opencode-go → http://192.168.31.147:8317/v1`，模型 `gpt-5.6-luna/default`。不推断 opaque 上游物理模型映射。

| 项目 | 本次实际证据与边界 |
| --- | --- |
| 预算 | 2 次真实 UI Send；1 个本批主 conversation/native；没有补发。3 个自动 aux 启动的请求/native 数量未知，不能将全局总量也写为 1/2。 |
| 身份 | `conv-1791625756410-4itbe1jhv` / `ses_edac88113ffesh3xxfGNUuNb7y`。两轮 conversation/backend/native/model 一致。 |
| 首轮 | user `msg_1253c0cb6001WvQm1TxJJmJ0Yd` / assistant `msg_1253c0cd3001FdCv4I8WDQ4H1F`，返回 `OC_FA_OC2LN_1010_F60CA2C8EE`。stop/completed/idle succeeded，零工具，实际回复可见。原 SDK envelope 未捕获。 |
| view / reload | 真实 UI close → chatLeaves 0 / old view events 0，重开 fresh view；真实 Settings toggle unload → plugin absent / commands 0 / old instance events 0 / client absent，load → 新实例 / commands 25。自动恢复同 native。恢复原设置另有一次 API reload，明确区分。 |
| History | 真实指针点选目标 History row；点击前目标已 active，未捕获实际 loader。证明了点选后身份，未证明该点击执行 History 恢复，也未证明 inactive History 恢复。 |
| 第二轮 | 发送前 identity guard 同 native/model，无重选模型；SDK 仅 `{sessionID,text}`，提示不含完整答案。admission `msg_125476121001FMdvkPxB3e1W0L` / assistant `msg_125476145001HnBcANo2Z180rO`，正确回忆同标记，stop/completed/execution.succeeded，UI 可见。 |
| 历史 | 第一轮 4 条 native 完整前缀精确不变，SHA256 `978dcf623c6e98743593ad21ab59ebda1d0aa8e03553858cd4417dfc1946c238`；host 首 2 条完整前缀精确不变，SHA256 `3d4e9cfcc4c2462ff7f74066880c6db314a0c9813fc93d349e812762e94eeb83`。第二轮新增 3 条 native / 2 条 host。 |

## 失败停点与未证明条件

1. 首轮观测器安装含非 async IIFE 的 await，原工具返回 SyntaxError / exit 1，但 QA 未阻断后续首次发送。原失败与原脚本 patch receipt 已保存，非重新演示；第二轮才安装成功。首轮 UI 输入、native admission 文本和运行模型均已证明，但首轮实际 prompt 的 files/agents/skills 参数、省略状态、request options 和 switchModel variant 原参数未观测，不能由第二轮或默认值反推。
2. 重载自动恢复后点击的是已活动的 History 项，缺少该点击执行恢复的生产记录。恢复完成后没有重新切回 local 制造额外资源，保留该缺口。
3. 产品自动 `startInlineCompletionSession` 启动三个 aux PID 23988 / 18504 / 23968，发生于关闭 view 聚焦 editor / 重载 warmup。没有主动执行 Aux/editor 验收；服务及 disposable tmp/DB 已被产品 dispose，HTTP Failed to fetch，不能证明零 prompt 或零 aux native。没有把自动行为计为新增物理 UI Send，也没有隐去其未知请求量。

这是控制/证据完整性失败；没有根据本批结果认定产品首轮发送或回忆故障。没有源码修复、额外诊断请求或范围扩展。

## 恢复与隔离

54 个非目标完整 conversation 的 JSON.stringify 序列化 before/after SHA256 全部相同（未排序 keys，不称其为 canonical JSON）。原 Pi/current/native、3 tabs 与 active slot、草稿、模型和布局语义恢复；OC2 设置、临时 process env 和两个私有配置文件哈希核对恢复。完整 settings 并非逐字相同：tab runtime IDs 与 pluginUpdateState.lastCheckAt 改变；view 中 tabs[0].contextUsage.updatedAt 的正常读回时间改变，usage 其余字段一致；布局仅重建 chat leaf ID 和对应 active ID 改变（`a29faf4a71be4ec9 → 4f61e72472b0273a`）。

spawn/chat 观测器及临时 global 移除；5 个本批 owned PID（26116、23988、18504、22652、23968）与端口均不存在。本批本地 SSH forward 97015 / 19340 已清理。原 9238/9244 profile 的 PID/创建时间/argv 不变，renderer 22716 存活；未知/用户服务未清理。合成主会话保留，敏感完整快照位于私有 ACL 目录，不进 Git。

账本只向 local-native/win32 的 S01、S02、B01、B12 追加实际覆盖子条件，保留整项待验与 wholeCasePassed=false；完整 manifest/GUI PATH/npm shim/故障矩阵、inactive History、全 handles/heap/vault 切换、Aux/editor 和其它 profiles 仍未通过。本批未推送、合并或发布。

## 证据

证据根：`/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native`。

- [QA 完整结论](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/delivery.md)、[QA 事实与边界](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/facts.json)
- [候选复用核验](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/candidate-reuse-verification.json)
- [两主实际 CLI / argv / cwd / 私有 DB 导出](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/main-spawn-safe-export.json)
- [首轮 native/UI 终态](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/first-terminal.json)、[首轮截图](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/ui-first-answer.png)
- [第二轮 request/native/UI 终态](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/second-terminal.json)、[第二轮截图](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/ui-second-answer.png)
- [主代理历史前缀精确核验](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/coordinator-history-prefix-verification.json)
- [原 observer 安装失败](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/first-observer-install-original-failure.json)
- [完整非目标哈希/设置恢复差分](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/restoration-read.json)、[主代理恢复核验](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/coordinator-restoration-verification.json)
- [OS 清理回读](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/os-final.json)、[观测器与 env 恢复](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/observers-restored.json)、[forward 清理](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/qa/forward-cleanup.json)

- [独立只读终局审查](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/independent-review.md)、[审查证据哈希](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/independent-review.json)
- [账本限定追加回读](/Users/dht/.codex/visualizations/2026/10/10/01a12521-a634-7601-af27-1f53b9d218fb/fa880-opencode2-local-native/ledger-bounded-append-receipt.json)
