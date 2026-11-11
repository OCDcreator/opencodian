# SessionWorkbenchCoordinator

2026-11-11（工作台信息架构）：host 新增可选 `mountResources` 与 `getFilesSummary`。前者将同一个工具 owner 的稳定目录 DOM 挂入一级面板，后者只读投影文件 owner 已有摘要到 `state.filesSummary`，使真实摘要变化参与既有 state fingerprint；不新增原生读取或 Git 扫描。目录创建在工具挂载之后，展示控件不接管后端操作状态。既有 Goal、Plan、Jobs、子会话回执、权限与刷新节流保持所属 owner。

> 源码：`src/features/chat/services/conversation/SessionWorkbenchCoordinator.ts`
> Owner：feature.chat-services

## 职责与边界

拥有每 tab 的目标预备、待确认草稿和只读会话投影。订阅真实 backend session，处理 alias、迟到响应、读取错误和原生确认。5 秒目标/原生任务对账、3 秒非前台流 transcript 对账；不产生自动续跑。聚合计划、任务、文件和资源；原生任务 ID 可读输出及取消。停止绑定发起 tab，切换不误停其他会话。测试 SessionWorkbenchCoordinator.test.ts。

## 验证

已完成目标的靶心入口只打开详情；用户显式选择“下一条消息设为目标”或“计划作为目标执行”时重新预备一次 Goal 发送。普通补充消息保持当前目标。

已完成目标的 composer 提示栏提供独立关闭按钮。使用 Obsidian 的 vault 级 local storage，以 backend + conversation identity 和原生 session/goal identity 记录关闭偏好，重载后不重复占据输入区；新目标或恢复执行时重新显示。关闭不调用原生 clear，目标按钮仍能查看详情。目标详情里的清除经 `controlSessionGoal` 和原生 readback 确认后更新，失败保留目标和错误。

composer 图标使用 SessionWorkbench 注册的 OpenChamber target / target-fill；活动/完成/受阻状态分别使用宿主语义色。行内暂停/恢复文案区分原生 Goal 控制与 Claude 执行控制。

按钮状态对齐 OpenChamber `d4a5a0ef13252fd60800c1a10c0eb08cc4aa15ff` 的 SessionGoalButton 和共享 sessionGoalPresentation：无目标未预备为灰色 target；点击预备后信息色 target-fill，再点取消。`aria-pressed` 表示本地已预备或原生存在非 complete 目标，不能只检查本地 armed。已有目标（含完成）点击打开管理；完成保留成功色但不代表继续运行，直到用户原生清除才恢复无目标。暂停为灰色，受阻/用量限制为警告色；其它后端 waiting 显示警告、unknown 和执行已停止/原生 disarmed 显示灰色，不伪装为运行。无目标时 pointer/mouse down 保持输入框焦点。

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。

2026-11-09 Jobs 完成链路：将 `onNativeJobs` host 原样转发给 SessionInformationCoordinator，再由 view composition 接入现有 BackgroundTaskIndicatorCoordinator。既有 tick 对所有 DSH 标签执行有五秒限频的原生列表对账，即使标签非活动、foreground 已结束或尚无 legacy backgroundTasks，也能收到完成并刷新延迟提示。Jobs polling 不调度模型续跑。

2026-11-10 DSH 原生工作台：工作台 actions 的 `runTaskAction` / `setPlanMode` / `spawnTerminal` 原样转发进 SessionInformationCoordinator（其内部即 `DshNativeWorkbenchControls`），本模块不持有原生操作状态或第二份真值；Plan toggle、终端/子会话行与 spawn 表单全部渲染共享 `SessionWorkbenchState`，不新增 DSH 专属界面。

2026-11-10 子会话续接装配：`continueChild` 与 composer 状态回调（`onChildComposerInput` / `onChildComposerDelivery` / `onChildComposerFocus`）原样转发进 SessionInformationCoordinator；composer 草稿/投递/焦点的真值在该 coordinator 的 children map，本模块无第二份状态，也不因这些回调调度 onChange 重建。工作台 `actions.refresh` 先同步执行本地 `refresh()` 重投影，再启动权威读取；即使信息和子历史请求均挂起，trigger 重开也使用最新草稿与 caret，不依赖后台请求及时返回。

## 会话信息面板（2026-10-31）

会话信息读取、统计、来源和子会话检查交由 SessionInformationCoordinator；本模块保留 Goal、composer、任务投影与工作台装配。2026-11-09 起，原生任务读取/订阅/输出/停止生命周期也由既有 SessionInformationCoordinator 持有，本模块只转发，避免继续增长。DSH Jobs 通过可选原生能力显示在既有任务列表；`nativeJobId` 与 `nativeBackend` 保留独立身份，Jobs 不转成 Todos。其它后台任务只有原生子会话关联被确认时才调用子会话读取，禁止把任务 ID 猜成 session ID。
