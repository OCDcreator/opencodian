# SessionWorkbenchCoordinator

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

## 会话信息面板（2026-10-31）

会话信息读取、统计、来源和子会话检查交由 SessionInformationCoordinator；本模块保留 Goal、composer、后台任务与工作台装配。后台任务输出只有原生子会话关联被确认时才调用子会话读取，禁止把任务 ID 猜成 session ID。
