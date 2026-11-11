# SessionWorkbenchInformation

> 源码：`src/features/chat/ui/SessionWorkbenchInformation.ts`
> Owner：feature.chat-ui

## 职责与边界

会话信息渲染和共用面板 DTO 的 owner。定义 SessionWorkbenchState、WorkbenchSession actions/resources/tasks/page 类型并由 SessionWorkbench 兼容导出，避免信息渲染器反向导入容器而形成类型循环。

渲染套餐额度、会话统计、“会话引用”、MCP 及实际智能体列表。额度显示原生百分比和重置时间；上下文窗口占用不与累计令牌/费用相加。null 是后端未报告，不显示成零。MCP 说明会话级或工作区目录作用域；空目录与不可用不同。额度、统计与 MCP 默认折叠（见容器文档“工作台重设计 A”），显式展开记忆优先于默认值。`renderInformation` 在会话引用之后重新附着 Tools 拥有的稳定命令目录，再渲染上述低频信息。

“会话引用”（`renderSources`）是唯一的引用分组：先以“已发送”小标题列出 `state.resources`（草稿附件），再以“后端已加载”小标题列出 `state.contextSources`；两者共用同一行渲染规则（navigable=false 或无 path/command 的行只作说明行），可导航行显示来源详情与打开箭头。两组都不存在时显示诚实的空提示，不发明任何行。

2026-11-11 展开区打磨：每个额度窗口有独立的标签、进度与重置节奏；统计使用两列数据行，长模型 ID 独占一行并采用等宽字体；MCP 空目录使用图标、标题与作用域说明组成的空状态，而不是重复的灰色文本。任务行与终端 spawn 统一向下折叠箭头，spawn 使用轻量任务行而非嵌套单框分组。

智能体按运行、待运行、完成、失败/停止、未知状态排列。只有 readable 原生链接提供打开操作。`renderChild` 保持原公开入口，但只读转录与续接 composer 委托给同 owner 的 `SessionWorkbenchChildView`；后者独立管理 Obsidian MarkdownRenderer 和 Component 生命周期，不写入主会话、不执行子会话中的工具。

2026-11-09：`WorkbenchTask` 增加可选 `nativeBackend` / `nativeJobId`，使 DSH Jobs 与工具调用、子会话及 Todos 保持独立身份。现有 tasks UI 仍通过 actions 读取/停止；不打开 OpenCode 专属 Subagents 门控。

## DSH native phase2（2026-11-10）

DTO 扩展 `nativePlan` / `nativeTerminals`，渲染契约：

- `renderPlanMode`：共享 Overview 中的**扁平单行** Plan 控制（`opencodian-workbench-control-row`，2026-11-11 起不再使用折叠分组，因此没有重复展示状态的头 + 子项）。按钮是唯一可访问状态载体：`aria-label` 固定为 Plan 模式名称，状态只在 `aria-pressed`（active）出现一次；尾部的可见状态 chip 对辅助技术隐藏。queued 只以 `opencodian-workbench-control-note`（缩进文本列）呈现，从不显示为 active 状态；`!settable || busy` 时禁用按钮；整行按钮包含名称与不伸展的状态 chip，固定 scope 帮助收在 tooltip，notes 仅按需展示排队／取消／失败／不可用反馈，避免一级首屏常驻重复说明。
- `renderTaskActions`：原生行 pending 是 surface 拥有的 `pendings` 计数，按 identity + task id 键控；重绘按 lockKey 重建锁定行。终端输入行带 `secret` 标记，pending 期间输入与按钮一并禁用。结算一律经 `settleResult`（见下节）：落到同一 owner 的活动行并解锁重建后的行（经 `rowLookup`，无输入框的行同样解锁），失败发送的草稿回到可见输入框且不覆盖较新的输入；行不在屏幕上时进入 journal。`usesInput` 但行没有输入框的动作与能力禁用的动作一样标记 `capabilityDisabled`，不会被解锁误启用。操作结果写入当前行输出，不新建弹层。
- `renderTerminalSpawn`：折叠的原生终端 spawn 表单（backend select / name / cwd），置于“会话终端”分组内。可选的 name/cwd 收在真实的 `<details class="opencodian-workbench-field-advanced" data-draft="spawn:advanced">` 高级选项里，展开状态与字段值经 `data-draft` 在重绘间保留；真实服务能力不变。启动是单飞的（`spawnPending` 按 identity）：未结算期间按钮禁用、表单 `aria-busy`，重建出的新表单同样保持锁定。回执存于 `spawnReceipts`（按 identity），只写到该会话当前的活动表单（`spawnLive`），重建期间结算的回执不会落在已脱离的节点上，其他会话也不会显示它。spawn 不可用时显示诚实原因和（可选）设置导航按钮。

DTO 另含可选 `filesSummary?: string`：coordinator 投影的权威变更摘要，容器把它显示在文件导航行尾部；缺省时显示中性入口文案，绝不从 Git 推断。`SessionWorkbenchActions.mountResources?(parent)` 是可选挂接：宿主构造时在 `mountTools` 之后调用一次，把 Tools 拥有的内联命令目录挂进稳定宿主元素（容器负责 detach / reappend，本模块不清空其内容）。

## 内联任务行与状态保留（2026-11-11）

任务行从退役的 tasks 页迁入 overview，行渲染与其状态规则都在本模块，surface 只提供跨重建存活的 Map（`WorkbenchRowState = { pendings, settlements }`）：

- `renderActivity(parent, state, rows)`：“子代理与后台工作”与“会话终端”两个分组。分组只读 `task.nativeTerminalId` 元数据，从不按 id 或标题判断；spawn 表单在终端分组内；两者都没有时保留一个默认折叠的诚实空分组。
- `renderTaskRow`：每一行都带 `data-task`（活动行查找）和 `data-draft="row:<id>"`（展开状态），输出元素都带 `data-draft="output:<id>"`，因此所有行（不限带 actions 的行）在重建后保留展开状态和已呈现输出。
- `captureDrafts` / `restoreDrafts`：捕获并恢复 `data-draft` 值（输入值、选区、焦点、展开状态、输出文本）。输出是展示快照，不是权威：捕获时记下它所覆盖的权威 `task.output`（`WorkbenchDraft.authority`），恢复时只有在没有更新的内容时才把快照写回 —— 行还没有输出，或本次重建渲染的是**同一个**权威输出（只是别的字段变化的 tick）。`task.output` 的值确实变化、或本次渲染投影了 journal 里的结算时，新内容优先。权威文本的原样副本（快照等于其权威值）不算用户快照，后端不再报告该输出时不带到下一次渲染。输入框同理：行上已有的值（投影回来的失败草稿）不会被空的旧草稿覆盖，较新的输入仍然优先。
- `settleResult`：任务结果归属任务身份而非 DOM 节点，并且只对它所对应的权威输出有效（`WorkbenchSettlement.basis`，null = 无）。动作结果的 basis 是结算当时的权威：活动行正在显示的；行被隐藏时取 owner 会话当前 state（`authorityLookup`）；其他会话时退回该行最后一次渲染的 `task.output`（`authorityAt`）。懒读取的 basis 是读取发起时的权威。输出仲裁只有一条规则（`meetsAuthority`）：只要当前存在**不同的**权威输出，结果就不显示。因此读取挂起期间权威出现或变化会丢弃旧读取（活动行与 journal 两条路径都比较，同权威的 tick 不受影响）；隐藏期间权威推进后，旧结果不会盖过新权威，也不会在之后的 tick 中被保留；权威推进之后才结算的结果不落后于它，照常显示；后端不再报告输出时，用户尚未见过的回执仍会显示。失败发送的草稿是用户自己的输入，不受输出仲裁影响，照常回填。结果写到同一 owner 当前的活动行；该行不在屏幕上（目标详情、子会话转录、其他会话）时以 lockKey 记入 `settlements`，由该行下次渲染投影一次。动作结算和展开时的自动 `readTaskOutput` 共用这一路径，所以读取挂起期间行被隐藏或重建也不会停在“加载中”。

`rowLookup` / `inputLookup` / `lockKey` / `authorityLookup` 由 surface 绑定；`authorityLookup` 只是当前 state 中该任务 `task.output` 的只读投影，本模块不持有原生状态，也不另存第二份权威。`spawnPending`、`spawnReceipts` 与输出的权威映射只是 UI 回执与展示记录。

所有输出仍经共享脱敏并保持 65,536 字符上界；本模块不持有原生状态，只渲染 coordinator 投影。pending send/draft 跨重绘修复正在落地，最终契约如上、暂不作 PASS 记录。

## 子会话续接 composer（2026-11-10）

`renderChild` 对 `mode==='continuable'` 的子会话渲染独立续接 composer；one-shot/external/unknown 模式只渲染 `workbench.info.childReadOnly` 只读说明，绝不出现输入框。composer 语义：

- 子会话转录的 `role==='user'` 可见文本复用 feature.chat-rendering 的 `maskUserMessageSecretsForDisplay` 做显示投影（主气泡脱敏，子会话面板不明文回显密钥）；assistant/tool 输出走既有上游策略。投影只作用于渲染副本，`readChildSessionMessages` 返回与持久化 message 对象不变。

- `state.child.canContinue` 三态门控：`true` 才启用发送；`false` 显示 parent-unavailable 说明（不渲染输入）；`'unknown'` 显示可重试说明且禁用发送；探测未完成（undefined）时发送禁用。
- 草稿/投递方式/焦点由 coordinator 持有（`child.draft`/`delivery`/`composerFocused`），重绘后恢复值、焦点与光标到末尾；输入事件经 actions 静默持久化，不触发 onChange 重建。
- 投递方式是分段按钮（role=radiogroup，queue/steer），不是 native select；选择经 actions 持久化并在重绘后保持 aria-checked。
- 发送经 `actions.continueChild`（唯一通道，指向精确子会话）：成功后 receipt 写入协调器状态 `child.sendNote` 并立即重建（陈旧输入当场清除，二次空点击不会重发）；历史读取独立进行，失败仅落转录错误，绝不抹除或降级 accepted 凭证；失败发送保留草稿与可读文案，绝不自动重发或回退父会话发送。发送中本地禁用按钮。
- 回修勘误（2026-11-10 review）：可写输入框仅在 `canContinue === true` 渲染；false/unknown/未完成探测只渲染说明（false=parent-unavailable，unknown/未完成=能力未知/加载中），不出现 textarea。重建恢复 coordinator 持有的光标位置（input/select 事件回传 caret），不再强制移到文本末尾。

## 验证

SessionWorkbench.test.ts 覆盖无 Goal、独立折叠、不可用额度和主/子面板滚动恢复；SessionWorkbenchOverview.test.ts 覆盖首屏层级、会话引用合并、待办计划与终端分组；SessionWorkbenchRows.test.ts 覆盖隐藏视图期间的草稿与结算、A→B→A 草稿往返、权威输出仲裁（旧读取、隐藏期间权威推进、权威消失）与 spawn 单飞/回执；会话身份和读取竞态由 SessionInformationCoordinator.test.ts 验证。窄屏、长标题、键盘和实际运行时数据需要 Test Vault DOM/截图验收。

原生加载来源的 navigable=false，文件路径只作说明和 tooltip，避免将 Vault 外的记忆路径当成可创建的 Obsidian 链接。累计统计采用原生 totalTokens，不盲目加输入/输出漏掉缓存。
