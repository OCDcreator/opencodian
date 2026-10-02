# Mac 续做：六后端接入实机验收

任务日期：2026-10-02。本轮按用户指令收尾、提交推送并移交 Mac。以包含本文的已推送 main 提交为起点；最终提交号与同步结果由外部 closeout/sync-result.json 记录。

## 可直接复制的续做提示词

你正在 Mac 继续 OpenCodian 六后端接入验收。调用子代理继续工作，不重复已完成的审查与实现。先读取本文件、AGENTS.md、CONTEXT.md、相关 ADR、graphify-out/GRAPH_REPORT.md，以及 backend-integration-implementation-2026-10-02.md 的“当前收尾”节。遵守 owner 路由、CodeGraph callers＋有限 depth impact、module docs、Graphify src-scoped 更新；不 init 图，不修改 reference-projects。

主同步仓库：/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian。后续实施工作树：/Users/dht/.codex/worktrees/opencodian-backend-integration-completion（非同步路径）。先核对 git status/HEAD，使用已同步的收尾提交，不覆盖用户后来修改。若需补修，在这个非同步工作树实施。

Windows 最终门禁：15 gates PASS，964 suites／9924 tests，lint 0/0，typecheck 与 build PASS。版本 1.1.36，BUILD_ID HEAD.202610022256。两端正常 Test Vault 都已经用真实开关重载并实际回读该 BUILD_ID；源码 freeze 962 paths 保持一致。所有本轮阻断 finding 经独立复核关闭。没有版本 bump／新发行发布。勿把这次代码通过当全部实机通过。

证据：
- Windows 筛选交接根：/Users/dht/.codex/artifacts/opencodian/backend-integration-2026-10-02/windows-closeout/；final-expansion/ 内含最终 verify、review、native summary、readback。
- Mac 原有阶段证据：/Users/dht/.codex/artifacts/opencodian/backend-integration-2026-10-02/final-expansion/；native-t12 的脚本与实际临时 stage 路径见 REPLAY.md。
- 标准三文件最终包：windows-closeout/final-package/。先核对 package hashes，不借用开发 node_modules/assets。
- 正常 Test Vault：/Volumes/SDD2T/obsidian-vault-write/testvault。
- 隔离验收库：/Users/dht/.codex/artifacts/opencodian/backend-integration-2026-10-02/final-expansion/release-install/mac-vault；宿主 profile 为相邻 mac-host-profile。

立即做本地 inventory，形成具体并行路径：父代理负责 Codex 新 owned 会话→forget 与 catalog 实机关键路径；子代理负责隔离三文件包升级／Pi 恢复和 controls；另一只读子代理维护 canonical 验收账本并独立复查新 finding。子代理写集合互不重叠。不要默认调用 opencode CLI 或启动新 OpenCode 服务；已有 HTTP 服务可读。

剩余动作依次推进：
1. 用真实 Obsidian DOM 点击／键盘打开 chat，核对当前 loaded BUILD_ID。两端 reload 会关闭 chat leaves，旧 conversation 在磁盘保留只证明存储，不证明成功重新载入。只操作本轮 owned 会话，不删除旧用户历史。
2. Codex 使用当前实际存在的模型；Mac 前轮 custom/gpt-6-sol 模型通过，Windows gpt-5.4 是 provider 404，gpt-6.1-sol 单次重试通过。新建 read-only owned 对话，受控 nonce、一轮即可，记录 local ID 与 native thread ID。
3. 真实历史按钮→仅遗忘本地→取消，证明本地会话/缓存/tab/native 身份未变；重开→等待确认倒计时→确认，证明文件明确不存在后才清本地状态。随后真实后端会话浏览器和只读 thread/read 确认同 native ID 仍存在；不能用 fake RPC 或内部 setter 计作实机。
4. Codex 恢复与检查：线程、模型、permission、MCP、loaded threads 五个目录是真实分页 collectors 的 UI 消费。观察 loading／complete／partial／failed／unavailable／empty，不以失败当空。正式多页、去重、页二失败测试已通过；真实目录若没有跨页，记录实际覆盖，不人为注入数据后声称 native pass。打开只读目录不得顺带 OAuth／archive／delete／config write。
5. 隔离库升级：只复制最终包 main.js／manifest.json／styles.css，备份覆盖文件，独立 SHA256→真实开关 reload→实际 loaded BUILD_ID；保留旧设置及下列三层身份。真实历史恢复并发一条必要 nonce，证明 same native UUID continuity；没有 assets／PDF／SDK/node_modules，不据此声明 PDF 资源验收。
6. Pi Sessions→Workbench：当前会话动态 thinking levels（包括 runtime 真正支持的 max）、native entries 和 since 使用原生 entry ID。unknown/unavailable 与 full-history fallback 显式区分。原 config 未修改的未知 enum 可原样 roundtrip；新写或改未知值仍拒绝。只在 owned 项目配置 fixture 测，不改 global。
7. Claude Runtime/MCP controls：无 session／unsupported/failure 不虚报成功，ACK 和 effective 分开。Mac CLI 2.1.204 已拒 reload_output_styles，正确验收 unavailable。无 MCP server 则 tightening unavailable，不注册新 auth 来凑通过。ZCode Connection 管理刷新可用/不可用分列；既有 T09 installed save→reopen→native effective 已 verified／pending／verified。
8. 补齐 64 canonical cases／17 profiles 账本，逐 case/profile 关联 L0–L5 证据；只有完整场景语义满足才 passed。当前父代理 conservative ledger 中完整 canonical pass 为 0，native 子场景与正常库加载独立记录。原账本子代理因外部 provider 403 退出，无其完成声明。
9. 真实 auxiliary 读写正负控制、OpenCode2 auth/model、OAuth/MCP App 等未完成项继续正确显示 blocked/unavailable/unverified。不得用旧模型 nonce、mock fixture、磁盘 copy 代替新构建的 actual UI/native terminal。发现真实问题就按 owner 最小补修、独立审查、适当测试与最终 verify。src 更改后统一 Graphify，再 build；涉及 deploy-relevant files 按 build→copy→readback→loaded 逐步重验。

## 已冻结证据与运行边界

- Codex R1/R2：真实存储 EACCES、仍存在、读回失败均保留可重试状态；混合目标 disabled／aria-disabled，独立 2 suites／43 tests、15 hashes。
- Pi PC1：6 schema enums 未变未知原值 policy，独立矩阵156/156，5 suites／41 tests、27 hashes。
- T10 race、part barrier、type coupling：独立6 suites／60 tests、8 hashes；runtime cycles0、type-only5、mixed14，新耦合0，baseline字节未改。revision maps 随 live session 历史 ID 累积，eviction 才释放；这是后续保留策略边界。
- T11 CLI0.160.0／SDK0.158.0分列；官方 rust-v0.160.0 SHA a956835d020762cb2b570053af06f643a11c0ecc。gateway只读observed；MCP App／disabledPluginIds advertised；候选默认关闭。
- T12 15成功nonce包含Mac Pi旧source模型阶段；后来当前4模块native只读controls9项pass、未追加收费请求，不能当最终UI。Windows/Mac Codex app+SDK、Claude、Pi，Mac OpenCode1两轮、ZCode生产adapter一轮有真实证据；OpenCode2已有57355/57582 listener401；L2fixture10项不代替v2L3。
- 全部 auth 登录／注册／撤销计0，global native config字节未改；不要输出 credential backups。Windows正常库active/enabled/Codexmodel/sandbox四字段已恢复。

Mac 隔离旧基线会话：local conv-1790948768387-ztu04qcw8 → Pi store pi-d9405045-bd9c-415a-a193-550c6c284ab1 → native UUID 01a0fcdd-7a75-7314-95cc-50d8181af9a8，assistant entry be59df0b，一条 baseline nonce、零 tool results。升级尚未复制。Windows隔离旧会话 local conv-1790947638279-z9vtw4kxe → pi-0f06c819-b293-4472-be49-546da5386581 → native UUID01a0fccc-3bb4-71c5-b8f0-915c8fb87f40，entry d41c0658；不把Windows数据当Macnative。

正常 Mac 原进程81543保留；CDP本机9222，隔离本机9224。Windows转发42792（19222→9222）与62124（19224→9224）在收尾时仍运行，只能处理已核实自有PID，不能杀用户原Obsidian。Mac宿主正常1.13.7、隔离1.13.4（启动时版本），使用实际readback为准。

## UI 选择器

- local forget：button[data-codex-forget-local="true"]；确认 .opencodian-delete-confirm-confirm，取消 .opencodian-delete-confirm-cancel；历史 checkbox .opencodian-history-item-checkbox input。
- backend browser：data-session-id（native ID）、data-session-catalog-state。
- Codex模型data-model-id，权限data-profile-id，MCPdata-mcp-server-name，loadeddata-thread-id；结果data-readback-state／data-mcp-state。
- ZCode management：[data-settings-target="zcode-management"]。
- 聊天textarea.opencodian-input；按钮通过真实可见的 getByRole 定位，custom combobox 要点击visibleoption，不能给隐藏select直接赋值。
- Playwright evaluate仅用于DOM与readonly状态回读，不调用mutating plugin methods代替用户路径。新控件测试时记录截图、实际步骤、版本、local/native IDs、terminal与成本边界。

不要清理非本轮创建的文件，尤其同步目录中 %SystemDrive% 缓存形状的遗留目录；本轮未提交也未删除这些无关文件。Mac续做完成后再按新用户指令提交／推送；本交接不预先声明最终发行验收通过。
