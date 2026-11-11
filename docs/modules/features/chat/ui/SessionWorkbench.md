# SessionWorkbench

> 源码：`src/features/chat/ui/SessionWorkbench.ts`
> Owner：feature.chat-ui

## 职责与边界

右上角会话信息胶囊与紧凑分组卡片。参考 ZCode 状态面板的 320px、折叠分组、轻图标按钮；OpenChamber composer Goal 行。会话信息内的文件变更、工作区终端、仓库、浏览器与预览入口直接打开对应卡片，卡片标题使用具体功能名，不显示“会话工作台”或概览/任务/文件/工具页签导航；任务行与命令目录内联在会话信息中（见“工作台重设计 A”）。支持展开、Esc、完整目标编辑和后端真实预算。会话分别保存当前卡片、工具及分组展开偏好，原生状态由 coordinator 传入。测试 SessionWorkbench.test.ts。

会话信息与具体卡片都使用独立标题行；展开、关闭等控件留在标题区，不插入额度等信息分组。概览级刷新只在概览显示，二级工具页保留各自真实的局部操作，避免与 Git 等局部刷新形成重复入口。信息选项以间距区分，文件与工具入口统一为单列整行按钮，图标、标签和末端箭头保持一致。“会话引用”包含当前会话的附件及后端加载来源；命令/技能目录由 Tools 内联挂载在会话信息内，两者不混用名称。

停靠入口仅在聊天区域宽度达到 960px 且未展开时显示，避免窄侧栏出现点击无效的按钮；停靠状态通过 `aria-pressed` 与选中样式反馈。缩窄时释放聊天区预留空间，恢复宽度后还原会话内停靠偏好。

停靠底边测量可见输入框 `.opencodian-composer-shell` 的下边缘，通过 `--workbench-dock-bottom` 对齐，不把输入框下方状态栏计入面板高度。缺少输入框外框时回退到输入区域底边；浮动和展开仍避让整个输入区域。

顶边不再用固定 80px 猜测：`syncLayout` 测量 `.opencodian-messages-shell` 上缘（即真实 chat chrome 底部——换行表头或表头下方页签条）加既有 15px 间距写入 `--workbench-top`，触发胶囊与打开面板共用同一变量；缺少消息区锚点时保留 CSS 默认 80px。ResizeObserver 同时观察消息区，表头换行（如 53px→86px）或页签条出现都会即时重测。

## 验证

关闭后恢复打开面板的 Goal/会话信息入口焦点；展开时管理键盘焦点边界，随输入区高度更新面板底边，保留发送与停止入口。具体卡片提供返回会话信息的操作；工具跳转通过 `openTool` 同步卡片标题和工具内容。
使用 Obsidian 原生 Scope 注册 Esc，打开时 push，关闭或销毁时 pop，避免宿主快捷键层在 DOM 冒泡之前截获关闭动作。

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。

## 会话信息面板（2026-10-31）

会话信息始终提供信息模块，Goal 仅在已有目标、已预备或用户主动打开时出现。SessionWorkbenchInformation 持有信息 DTO/渲染，容器管理每会话分组折叠、卡片选择和主/子视图滚动。未知数据不伪造为零；观察时间变更不引发无内容变化的重绘。

文件变更是单行导航入口（不再是只包一个子项的折叠分组），点击后进入原有权威变更组件所在的文件卡片。

composer 的目标行与专用 Goal 入口直接进入目标详情视图，展示完成条件、原生状态和支持的操作，不再先展示额度等信息。可返回会话信息，Esc 回到原入口。切换会话退出目标编辑；实时对账不覆盖正在输入的编辑草稿。

操作依据 capabilities、原生状态和 readback 可靠性显示：暂停/恢复、编辑或替换、清除、已完成后的新目标预备。Claude 的执行停止/继续有独立文案，完成目标不出现恢复按钮；缺失扩展或不支持的 transport 不展示可执行的伪操作。保存携带原生 revision 和支持的预算，失败保留草稿并显示原因。

目标图标直接复用 OpenChamber `d4a5a0ef13252fd60800c1a10c0eb08cc4aa15ff` 的 `components/icon/sprite.ts` 中 target / target-fill。路径保持原样，以缩放组适配 Obsidian 100×100 图标坐标。MIT 署名随 `assets/workbench/OPENCHAMBER-LICENSE.txt` 打包。

## DSH native phase2（2026-11-10）

DSH 原生状态只进共享工作台，不新增任何 DSH 专属 strip／modal／sidebar／CSS family；被否决的 `DshSessionWorkbenchModal` 保留在磁盘但无运行时入口。渲染仍由 coordinator 传入的原生状态驱动，容器不持有原生真值。

- **Overview**：独立 Plan 以一行 toggle 呈现（与 Goal 同构，`aria-pressed`），排队中的变更只作为 note 显示、从不伪装为 active；不可 set 或 busy 时禁用。
- **任务行（2026-11-11 起内联于 Overview，见下节）**：DSH 终端与子会话投影为通用任务行（同一行对象复用直到下次原生读取）；终端行提供有界历史输出、secret 输入发送、五信号菜单与关闭，子会话行提供详情与经父会话的取消。终端 spawn 是折叠表单，字段草稿经 `data-draft` 在重绘间保留；能力或可用性不足时显示诚实原因与设置入口。
- **pending/草稿契约**：原生行操作 pending 状态由长生命周期 surface 持有，按 workbench identity + task id 计数（`taskPendings`，`lockKey` 传给 information view）；重绘同会话时按 lockKey 重建为锁定行，settlement 只解锁当前承载同一 task 的行、绝不解锁已脱离的旧行。同一行+操作的未决发送不能发起第二次原生发送，重复点击被拒时保留较新的输入草稿。（此为最终契约；pending terminal send/draft 的跨重绘修复正在落地，暂不作 PASS 记录。）

## 工作台重设计 A：首屏层级与内联活动（2026-11-11）

共享工作台不新增 DSH 专属外壳、弹窗、页签或工具下拉。会话信息（overview）自上而下，一级先看当前会话对象，工作区工具后置：

1. 诚实状态（evidence / error）与 Goal（仅在已有目标、已预备或主动打开时）。
2. 当前会话对象：Plan 模式扁平单行（`SessionWorkbenchInformation.renderPlanMode`）→ “文件变更”单行导航（`.opencodian-workbench-files-nav`，静止右箭头，尾部为 coordinator 投影的 `state.filesSummary`；缺省时显示中性的 `workbench.info.openFiles`，绝不从 Git 推断或伪造数量）。
3. 内联活动：“待办计划”（`workbench.todoPlan`，与 Plan 模式区分，完整列出且仅此一处）→ 智能体 → `SessionWorkbenchInformation.renderActivity` 渲染的“子代理与后台工作”完整任务行与“会话终端”（`workbench.sessionTerminals`）。终端分组只依据 `task.nativeTerminalId` 元数据，不按 id 或标题猜测；折叠的 spawn 表单位于该分组内。没有任何任务和终端服务时保留一个诚实的空活动分组。
4. 会话引用与命令目录：先显示会话引用，随后是稳定挂载 `.opencodian-workbench-inline-resources`。构造时在 `mountTools` 之后调用一次可选的 `actions.mountResources(parent)`，其内容（内联命令目录与相关设置链接）归 Tools 所有；overview 重建只 detach / reappend 这个节点，从不清空或重建它。子会话转录与目标详情视图不显示该挂载，返回后重新附着同一 DOM。目录是输入区资源，不再从视觉上归入工作区工具。
5. 低频信息：套餐额度、会话统计、MCP，默认折叠。
6. 工作区工具：非交互小标题（`.opencodian-workbench-group-label`）下的三个入口——工作区终端、仓库、浏览器与预览。通用“任务”与“命令与资源”快捷入口已移除。

会话范围说明（`workbench.scopeHelp`）只作为 overview 区域的 `title` 提示，不占用首屏正文。

折叠默认值：`disclosure(..., { collapsed })` 只在没有用户记忆时生效，用于低频信息分组和空活动分组，使 Plan、文件入口和活动留在首屏；用户的展开 / 收起仍按 `identity:key` 独立记忆，不随刷新重置。折叠分组使用 `chevron-down`（展开时由 CSS 旋转），静止的 `chevron-right` 只用于进入独立视图的导航行（`navRow`）。

旧 `tasks` 分类页已退役：不再创建 `.opencodian-workbench-tasks` 页面；`WorkbenchPage` 类型仍含 `'tasks'` 以兼容调用方，`setPage('tasks')` 重定向到 overview 并展开、滚动、聚焦活动分组（没有后台任务时落到会话终端分组或空活动分组）。`openTool('context')` 同样留在 overview：先打开面板，再调用 `actions.openTool('context')`，由 Tools 在稳定挂载中打开并懒加载目录；它不写入当前选中的工具，因此会话偏好不会恢复出一张空白工具卡片。从子会话转录触发时先 `returnToParent`。

状态保留契约（任务行迁入 overview 之后）。任务行、草稿捕获/恢复和结算投影的渲染逻辑在 `SessionWorkbenchInformation`，surface 只持有跨重建的状态：

- 草稿按会话保存：`overviewDrafts` 以 identity 为键。`stashDrafts` 在 `empty()` 之前把屏幕上的行草稿存到这些行所属的会话名下（`overviewIdentity`），重建后恢复输入值、选区、焦点、行展开状态、已呈现输出与 spawn 表单字段。子会话转录、目标详情视图和其他会话都不会用空捕获覆盖它们，A→B→A 往返后恢复；未渲染的行返回时不抢焦点。
- 所有任务行都保留展开状态和已呈现输出（不限带 actions 的行），因为 overview 每次 tick 都会重建。输出是展示快照而非权威：恢复规则见 Information 文档。
- 结算归属任务身份：`taskPendings` 与 `taskSettlements` 由 surface 持有，键为 identity + task id。`rowLookup` 只返回当前 identity 在 overview 中的活动行（`data-task`），`inputLookup` 由它派生；行不在屏幕上（目标详情、子会话转录、其他会话）时结果进入 journal，待该行下次渲染时投影一次。`authorityLookup` 是给输出仲裁用的只读投影（当前 state 中该任务的 `task.output`），surface 不另存第二份权威；仲裁规则本身在 Information 文档。
- 导航原点按会话保存：所有卡片共用一个滚动容器。离开 overview 时以 `scrollKey`（identity + child/main）记录滚动位置和触发控件的 `aria-label`（`overviewOrigins`），返回时恢复该位置并把焦点还给（可能已重建的）同名控件，不再泛化地回到顶部第一个控件，也不会被另一个会话的原点覆盖。原点匹配与回退（`overviewFocusTarget`）都只在 overview 内 `reachable()` 的控件中选择：原点控件此时位于已关闭分组内时不回焦到它，而是落到第一个可达控件（例如该折叠分组自己的标题）。
- 会话切换：`switchSession` 保存旧会话的卡片偏好并应用新会话的偏好，`showPage(…, settle=false)` 只切换卡片；焦点延后到新会话的 overview 重建之后（`refocusCard`），不落在即将被移除的旧节点上，重建已经聚焦卡片内节点时不再覆盖。
- 命令目录编辑焦点：稳定挂载被 `empty()` 摘除会丢失焦点，`stashDrafts` 记录挂载内的活动元素与选区，重新附着后仅在焦点确实丢失（落到 `body`）时恢复同一节点；目标详情 / 子会话视图不恢复，也不与用户主动移走的焦点争抢。
- 文件卡片和工具卡片的 DOM 不被 overview 重建触碰，PTY / webview 不重挂载。

键盘：`onKeydown` 返回是否已处理。事件目标位于 `[data-workbench-native-keys]`（Tools 的 xterm 挂载；兼容 `.xterm`）之内时，面板监听与 Obsidian Scope 回调都放行 Escape —— Scope 回调只在按键已处理时返回 `false`。其余目标的 Escape 仍然关闭面板或退出目标编辑。展开态的 Tab 焦点陷阱、打开面板时的初始焦点和返回 overview 时的焦点目标统一经过 `reachable()`：除了要求元素已渲染，还显式排除位于已关闭 `<details>` 内的非直接 summary 后代（Chromium 对这类内容仍报告非零矩形），不把浏览器拒绝聚焦当作成功。

验证：`SessionWorkbench.test.ts`、`SessionWorkbenchActions.test.ts`、`SessionWorkbenchOverview.test.ts`、`SessionWorkbenchRows.test.ts`（jsdom）。真实宿主的布局、截图和 xterm 按键验收不由单测替代。
