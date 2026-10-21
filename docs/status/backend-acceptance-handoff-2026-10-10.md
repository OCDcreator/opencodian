# OpenCodian 验收交接与下一批提示词（2026-10-10）

本文件记录有限验收结果、保留条件及下一批执行范围，不声明六后端或全部 profile/platform 验收完成。

按本文提示词执行的 FA880 OpenCode 2 remote 重载恢复与回忆批次已在 2026-10-10 完成：一次 UI Send / 一次 SDK prompt / 零重发，同 native 回忆及观测范围内恢复通过，53 个非目标完整会话对象保持。详见 [本批有限验收结果](backend-acceptance-fa880-oc2-reload-recall-2026-10-10.md)。下方提示词保留作本批历史执行范围；本批一次发送预算已消耗，完整 B01/B12、local-native 启动和 Aux/editor 仍未晋升。

## 提交与运行状态

2026-10-10 核查时，原仓库 main 为 `eb3f1dc81f622392a6c996e247b63ed93f6648d7`，续接工作树为 `/Users/dht/.codex/worktrees/opencodian-remaining-acceptance/opencodian`，分支 `codex/opencodian-remaining-acceptance-1006`，HEAD 为 `60350ea2735371d188c3f1b04290b5762abb508f`。两工作树均无未提交更改。续接分支已有 30 个提交；这些提交未合并至 main，本批不推送、合并或发布。

本文件是对上述提交之后的交接记录。原插件版本仍为 1.1.37；当前已验证运行候选 `REMAINDER.20261009.clauderestore1` 的 main.js SHA256 为 `3f60a4f6c63aea1a3665c09dd7c6b851f9981a1f6f32cdd6a8c733280a0a6142`。既有完整 verify 记录为 986 suites / 10,330 tests。本次仅编辑交接文档，不重新运行或宣称新增源码测试通过。

## 已闭合的有限条件

| 工作包 | 当前结论 | 保留边界 |
| --- | --- | --- |
| FA880 Codex SDK fallback 模型归属 | A/B/恢复 A 的真实请求、模型/effort、native 连续性与隔离通过 | 只覆盖该机器和实际 profile；旧构建证据保留原身份 |
| Mac Claude 模型保存与 History 恢复 | `60350ea27` 修复后实际 Query、重载及 History 回忆通过 | requested Sonnet 与 native 公布 DeepSeek 标签分别记录 |
| Mac Codex app-server 回忆补证 | 指定 A 追加一次无答案回忆，实际 `gpt-6.1-sol/low`、同 native、正确回复 | 旧误发对象未被本轮修改；原第四次误发及基线缺口保留；隐藏 pane 的诱因未定位为源码缺陷 |
| FA880 Claude 运行失败 | 旧错误确认为 `ECONNREFUSED`，隔离 52217 转发缺失；恢复临时链路后诊断及两轮 History 回忆成功 | 本批转发已清理，后续依赖该配置发送须重建并核实链路；不是无需环境前提的全 profile 通过 |

证据入口：

- `/Users/dht/.codex/visualizations/2026/10/09/01a1206f-d99a-7310-9d63-a33120bb2a4c/opencodian-model-acceptance/delivery.md`
- `/Users/dht/.codex/visualizations/2026/10/09/01a120e8-3157-7461-a65b-07e0746ad313/opencodian-cross-host-acceptance/delivery.md`（旧失败保留）
- `/Users/dht/.codex/visualizations/2026/10/10/01a12394-21b6-7c41-b6cb-07d4071ff8b0/opencodian-failure-resolution/delivery.md`（最新补证）

## 全局工具事故状态

事故审计已结束，历史精确恢复和长期稳定仍有限制。四文件 `.zshenv`、`.bashenv`、`.zshrc`、`.hermes/HERMES.md` 当前静态检查正常，事故前逐字恢复未知。Cursor/Gemini 指定 hooks 字段最后回读正确、短窗口保持；Cursor lean-ctx 规则修复约 40 秒后再次被生成。

源码、时间及进程父子关系支持 OpenChamber MCP 会话自动维护为后续覆写触发来源，但唯一实际写入 PID 未直接证明。Codex Native Bash 拒绝 hook 早于本次事故，不应当作事故新引入问题修复。

该事项单独保留，不反复回滚规则，不运行 setup/init/install/update，不停止归属不明的共享 daemon。插件验收仅使用现有获准执行通道。全局完整快照属于私有证据，不能进入 Git。

证据：`/Users/dht/.codex/artifacts/lean-ctx-incident-closeout-2026-10-10-1145/closeout-report.md`。

## 新会话可直接执行的提示词

请实际继续 OpenCodian 剩余验收。本批只补 FA880 OpenCode 2 remote profile 的“关闭聊天 view → 完整插件重载 → History 恢复同 native → 回忆旧标记”有限条件，并核对其它会话和本批资源不受影响。主代理负责范围与交付，明确授权一个 FA880 QA 子代理自主执行完整工作包；按需使用一个只读审查代理，不启动六后端全矩阵。

本批最多九十分钟，预留最后十五分钟恢复和交付。完成即停止；到时仍受阻，给出具体证据、原因和所缺条件，不将时间到达当作通过。

### 起点与范围

1. 继续使用 `/Users/dht/.codex/worktrees/opencodian-remaining-acceptance/opencodian` 的 `codex/opencodian-remaining-acceptance-1006`。先核对最新 HEAD/status，保留后来更改。本交接文档的提交发生在 `60350ea27` 之后，不能把后续 docs-only HEAD 变化当成运行候选失效。
2. 读取本交接文档；原范围入口为 `/Users/dht/.codex/visualizations/2026/10/08/01a11c15-b6d1-7e71-aea5-1af2db7d4cf9/continuation-2026-10-09/ledger.json` 中 `NB-FA880-OC2-MAIN1` 与 `WP-FA880-OC2-ENV`。只查有关条件，不重建 1,906 行矩阵或重新统计全部 profiles。
3. 旧一轮 remote 成功和恢复的原始核验在该目录 `oc2-main-v6-actual-turn-restoration-coordinator.json`。它证明 production remote client 连接手动 owned native 服务（历史 PID 16940；2026-10-10 实测端口为 4297）的一个真实回合，不是插件 local-native CLI 启动证明。旧记录保留 `REMAINDER.20261009.composer1` 身份。
4. 当前固定运行候选优先复用 `REMAINDER.20261009.clauderestore1`；准确冻结清单见 `/Users/dht/.codex/visualizations/2026/10/09/01a1206f-d99a-7310-9d63-a33120bb2a4c/opencodian-model-acceptance/candidate-clauderestore1/freeze.json`。源码/产物一致则复用验证，只在实际磁盘/加载不匹配时进行一次有序复制与加载，不能为新日期重建。

### QA 执行

- Windows 仅 FA880。按 SSH 技能读取设备清单并实时核身份、隔离 vault/profile、CLI/服务版本、directory scope、访问地址、合法认证与加载 BUILD_ID。旧端口/PID 是定位线索，不能代替当前回读。仅沿原 owned 隔离服务和会话存储路径操作；若服务已退出，可在确认归属后按已记录的隔离方式启动本批拥有的服务，不接管或终止用户既有服务。
- 在状态修改前保存当前完整插件 settings、布局/标签/草稿与允许操作会话的必要内容基线，私有目录 0700、敏感快照 0600；不打印配置秘密或将快照提交 Git。
- 我明确授权本轮仅向旧成功的合成 OC2 会话追加一次无答案回忆：conversation `conv-1791528744638-o61olipfr`，native `ses_ee090c948ffenKj2mAqVn89bT1`。先只读验证旧 native 消息与当地 conversation 对应，保存前缀，预计答案仅从该会话的首轮合成内容读取到本地断言。
- 通过正常 UI 关闭当前聊天 view、重开并进行一次完整插件 unload/load，然后从 History 恢复指定会话。发送前立即核对当前 view 的 conversation ID/backend/native ID/model；全部对应指定对象才发送。标题、标签序号和屏幕位置不能代替身份检查。
- 提示要求回忆该会话首轮用户约定的合成标记，完整答案不能出现在本轮提示中，禁止模型读文件或调用工具。正常预算仅一次物理发送。核对同 native ID、准确 model/request 参数、历史前缀和新终态、正确回忆、实际 UI 可见回复；其它旧会话/default 不变。若 UI 空白，先核 native 终态及活动 pane 归属，不靠重发解决。
- 若旧会话不存在、原模型不再受支持或环境身份无法验证，本批停止发送并报告具体缺项；不重新创建同名会话冒充续聊，不改测 local-native profile。额外 retry 必须有已定位的新原因与主代理明确工作包调整，不为追求通过盲目追加。
- 首次 `unknown`/连接失败就收集 native/CLI 安全错误、实际响应或监听状态，区分环境、模型服务和插件，不能“重载再发”重复验收。只有确认范围内插件缺陷才启动唯一源码写入者，按 owner routing、CodeGraph callers/有限深度 impact/affected 及独立差分审查做最小修复；有源码变更才按仓库要求完整 verify、零 lint 警告、模块文档/图谱与新固定候选验收。保留版本 1.1.37。

### 权限、执行通道与返工限制

我授权本批使用已有合法认证向当前已配置且旧 remote 成功路径实际使用的模型服务发送上述合成回忆提示、必要 CLI 系统说明和指定隔离会话上下文。发送前核实实际有效目的地与数据范围；禁止读取/发送真实笔记、用户旧会话、凭据值或私有源码，禁止擅自换 provider/认证来获得成功。地址或数据范围超出原授权时先明确报告并取得授权。

使用当前实际可用且获准的工具通道。禁止 lean-ctx setup/init/install/update 和全局 MCP 重配置；无法调用 ctx_shell 不能作为重新初始化工具的理由。复用事故报告已核实的直接 argv 路由或获准只读文件工具，遵守 hook，不绕过拒绝。只需一次必要可用性检查，不再次审计/修复全局七文件。OAuth 成功登录仍排除。

主代理一次派单写明机器、候选、目标会话、断言、允许隔离配置及恢复边界；QA 自主完成准备/实测/回读/恢复，不逐动作要求 release。告知代理“你不是唯一代理，不得撤销他人改动”，不再派生代理。同一机器一个负责人。

准备约二十分钟未进入实测时，报告具体前提并简化控制。脚本连续两次控制失败改用直接 UI 或简化脚本，不开发新的 gate/ready/release/恢复框架。普通等待和定位变更只做聚焦检查；涉及写入/删除/对象归属的差分才额外审查。

结束恢复本批临时配置、原活动后端/会话/标签/草稿与观测函数，只清理本批自建进程/转发。旧合成证据保留追加回忆的真实历史。动态 runtime ID 等字段按语义报告差异，不能为了逐字匹配覆盖用户或其它代理新改动。不删除旧证据、不重置凭据、不碰标准 Test Vault。

### 最终交付

每三十分钟报告一次新结论和具体阻塞。最终给出本包通过/失败/受阻、源/候选/host/profile 身份、一次实际发送的 UI/request/native/历史/隔离证据和恢复结果。仅追加相关 B01/B12 子条件，local-native 启动、Aux/editor 和其它原条款继续保留未验；不能晋升完整 case/profile。

允许在该续接分支保存本批有意义的修复与文档提交。交付并停止，推送、合并和发布另行授权。
