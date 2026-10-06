# Codex 剩余验收阶段记录（2026-10-07）

本记录属于 `codex/opencodian-remaining-acceptance-1006` 独立工作树，起点 `eb3f1dc81f622392a6c996e247b63ed93f6648d7`。版本保持 1.1.37；没有推送、合并或发布。证据根目录为 `/Users/dht/.codex/artifacts/opencodian/remaining-acceptance-2026-10-06/`。这是阶段记录，不能称为六后端完整验收。

## 实机环境与构建

- Mac 独立 vault 是证据根目录下 `mac-vault`，使用独立 Obsidian profile，没有接管用户既有 Obsidian 窗口。Windows 是 `C:/Users/lt/AppData/Local/OpenCodianAcceptance/remaining-20261007/vault`，有单独 profile 和本轮拥有的 interactive scheduled task。
- 当前构建 `REMAINDER.20261007.codex4`，Mac/Windows 磁盘和 loaded runtime 均确认该值。main.js SHA256 `d23e84d405e75e9dad1896aa524329e6e25f640ee06dd04f6c5ecbb013da5daf`；manifest `376121d93d3029900f37c0282a485dc89efa99d346436210d2a770edcb020bec`；styles `b9d04c0a8eb2ba6636d62bfc0d2b9c2a6a5527d04a351128ca50ea930c9ebf96`。build、copy、loaded readback 为独立顺序步骤。
- Mac 同版本 0.160.1 重装后 `@openai/codex-darwin-arm64` 实际 exe 存在，SHA256 `09fa44fdc37a5fc70dc1ace31235f90468a2e193d0e85f7552eab068ea2582be`，真实 initialize/model-list 成功。CLI 忽略三条旧字段的警告保留，没有为消除警告修改用户全局配置。
- Windows npm shim 实际解析至 `@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`，0.160.1，SHA256 `9e7c59c05cc1ce5677b1f94e835b2ac038ca3be14504e78d558eacdb0ea3f55d`。
- Mac 另一个真正不同版本 0.158.0 的完整 exe 身份保存在 `codex-compat-0.158-handshake.json`；不是转发同一个 CLI 的第二个 launcher。

## 原缺口、处理和证据

| 原缺口 / 用例 | 原因与处理 | 当前结果与证据 | 未完成边界 / 所需条件 |
|---|---|---|---|
| S01 平台依赖缺失 | 备份安装包后重装同一 0.160.1 | 真实版本、exe、握手成功：`codex-cli-reinstall.log`、`codex-native-handshake.json` | 不能外推全部 runtime/profile manifest |
| S06/S09 目录异常与权限拒绝 | readback/MCP/thread UI 缺少拒绝分类，已加固定双语说明；partial 保留已有数据，不显示原始异常 | production transport 接 owned JSON-RPC fixture，五种目录 121 条、三页去重；页 2 失败保留 50 条与 cursor；empty/failed/denied/unavailable/cursor-cycle 分开。实际 UI：`codex-catalog-matrix.json`、`codex2a-ui-denied-*.json`、`codex2a-ui-page2-denied-*.json` | fixture 证明异常协议与 UI，不能冒充 native/server 权限或真实上游分页规模 |
| S07/B05/B11 fallback 模型不符 | SDK cached Thread wrapper 保留旧模型；每 turn 先 capture immutable options，同 native ID resumed wrapper 每 turn 重建 | codex3a 同 native `01a111f0-dec1-7531-a2d5-a138ec5243c3` 的 Luna low→high；UI、CLI args、native turn_context、provider request/response 一致，两 turn complete：`codex3a-high-readback-native.json`、`codex3a-provider-evidence.json` | 同一会话切档位不是完整 B11 两会话/permission/plan/queue；Windows fallback 尚未执行 |
| B05/B10 warning/reconnect 误显示发送失败 | SDK ErrorItem 是 nonfatal；将其映射信息状态、reconnecting 映射重试，真正 terminal error/turn.failed 仍失败 | 聚焦测试与实际 fallback 完成，没有 Failed-to-send 误报；首次 observer connection failure 保留为失败 | 不代表 401/429/400/断流/竞态全矩阵 |
| B01/B03 Windows 生命周期 | 在独立库真实新建、reload、resume 和消息前 fork | 父 `01a11241-6dcf-7780-bf63-048fe9bb6151` 两轮，reload 追问保留同 ID/旧 nonce；子 `01a11245-99b1-7c41-b8fd-a318cb8000f6` forkedFrom 指向父、首轮前缀与原 source IDs 正确，并继续生成：`windows-first-native-readback.json`、`windows-resumed-native-readback.json`、`windows-fork-child-readback.json`、`windows-child-final-readback.json` | 不替代三 tab 并发、全部 cancel/steer/恢复用例 |
| 0.158 兼容 fork | 插件仅接受 >=0.160 beforeTurnId；0.158 有 lastTurnId inclusive 和 thread/revert beforeTurnId | 实测只对新 child 截取历史，parent 两轮不变；前缀 child 一轮，首消息前 child 空历史且 lineage 正确：`compat-native-fork-alternatives.json`；最小补丁 `codex-compat-fork-proposed.patch` 已准备 | 不是上游能力不可用；跨模块 CodeGraph reviewed continuation 待批准，source patch 未应用、插件集成未验收 |
| 协商失败资源清理 | CodexAdapter.start 一般失败丢弃 client 前未 stop | 定位并准备 `codex-negotiation-cleanup-proposed.patch`；五个 direct function/method callers，depth=1，35 nodes（含 tests） | 待 CodeGraph 跨模块继续授权，不能声称已修复 |
| I04/I06 MCP 应用和执行 | 仅 private CODEX_HOME 加 owned read-only MCP；真实 tool/resource、disable/re-enable/retry | ping native call ID、UI 参数/结果一致；owned_fail error 后主 stream complete；disable 后 tools/resource 空且调用 unknown-server；re-enable 为 2 tools/1 resource，retry nonce 恰一次：`codex-mcp-ping-readback-native.json`、`codex-mcp-failure-readback.json`、`codex-mcp-disabled-operations-corrected.json`、`codex-mcp-reenabled-operations-corrected.json` | 该 server 无 OAuth，不证明 OAuth success/cancel/timeout |
| I01/U02 权限卡遮挡 | unresolved question 的 turn 取消 sticky header；按 composer 高度增加 scroll padding | Mac native deny/once/acceptForSession 各一次，应答/owned marker bytes 回读。Windows native 长 command 卡的 Deny+Submit pointer 成功：id=0 decline 一次、目标文件不存在、主 turn completed：`windows-deny-final-readback.json`、`windows-real-deny-pointer.json`、`windows-real-deny-submit-pointer.json` | Mac hidden 宿主 rAF 停止，手动调用已有 composer metric 后 pointer 才通过；不宣称 hidden 布局生命周期已修好。acceptForSession 不是永久 Always；退出未回答/重复提交未验收 |
| Windows 首次无权限卡 | 提示词允许模型直接给拒绝 token，native 没有工具调用 | 改为真实 shell 调用并等待审批后有 native approval；原假阴性 `windows-permission-outcome.json` 保留；wire Luna/high HTTP 200：`windows-provider-observer.jsonl` | 投影 tools=[] 只表示该字段未捕获；真实 custom_tool_call exec 已观察，不能据此推断工具表为空 |
| S03 配置 precedence | project 层被 native trust 禁用；-c trust 不能启用该层 | private home 增加 owned project trust；真实设置输入保存 project config，effective config/read origin=project，Luna/medium/readonly/never；`codex-project-config-native.json`、`codex-project-trusted-native.json` | 四层不同值与继承清除恢复未完整执行 |
| I10/A02/A03 OAuth | custom provider 当前 gateway required=false，owned MCP 无 OAuth | 核对 native gateway/capabilities 接口与实际响应 | 正向 OAuth 需要可撤销的 OAuth-enabled owned MCP/gateway 和人工授权；不重置用户认证凑通过 |
| 服务商有效模型/hidden budget | 可观测 request/response model、effort、usage | Mac fallback/Windows app-server 都有 provider Luna/high response；没有从 reasoningTokens=0 推断关闭 | 物理模型映射/内部 hidden budget 无权威回读；需上游 canonical served model、provenance、budget 字段 |

## 门禁和范围

`verify-codex4-staged-styles.log`：15 gates PASS，965 suites / 10004 tests，lint 0 errors / 0 warnings；包含 module docs、owner boundaries、graphify、typecheck、production build、generated CSS clean。Node 24 默认 reporter 令五个既有 TAP wrapper 误失败，显式增加 `--test-reporter=tap`，没有改变测试场景。失败日志保留。

CodeGraph 没有 init。修改前 qualified symbol callers/impact 使用 depth=1。会话浏览器 loadSessions 11 callers / 12 nodes、renderSessionList 2/3、status renderer 1/3；用户已批准其最小继续。SDK send/buildOptions/resolveOrCreateThread 和 normalizer onErrorItem 各 1 direct caller / 2 nodes。sync 和 affected 结果保存在 `codegraph-codex*-*.json/.log`。兼容 client 两方法跨 CodexAdapter 的结果为 2/3 与 1/3；未获批准的补丁尚未应用。

原始范围为 64 cases、17 profiles、34 profile-platform 单元。这里只记录子条件增量；app-server darwin/win32、sdk-fallback darwin 仍为 partial，sdk-fallback win32 尚未执行。没有整组通过统计。其它历史缺项保存在 `original-scope.json`，后续逐项关联，不能把局部通过换算为整组通过。

`preservation-codex-stage.json` 的 32 个检查全部 unchanged：主仓库、旧多后端工作树的 HEAD/status/diff/未提交文件，四个原始 JSON 账本，Codex auth/config，以及原标准 Test Vault main.js。所有本轮写入和进程限于独立工作树、owned artifact 根及两个隔离库。
