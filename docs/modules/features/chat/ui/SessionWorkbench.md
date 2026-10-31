# SessionWorkbench

> 源码：`src/features/chat/ui/SessionWorkbench.ts`
> Owner：feature.chat-ui

## 职责与边界

右上角状态胶囊与紧凑分组浮层。参考 ZCode 状态面板的 320px、折叠分组、轻图标按钮；OpenChamber composer Goal 行；详情提供任务、文件、工具 tabs。支持展开/停靠、Esc/键盘 tabs、完整目标编辑和后端真实预算。会话分别保存页签及分组展开偏好，原生状态由 coordinator 传入。测试 SessionWorkbench.test.ts。

## 验证

关闭后恢复打开面板的 Goal/工作台入口焦点；展开时管理键盘焦点边界，随输入区高度更新面板底边，保留发送与停止入口。
使用 Obsidian 原生 Scope 注册 Esc，打开时 push，关闭或销毁时 pop，避免宿主快捷键层在 DOM 冒泡之前截获关闭动作。

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。

## 会话信息面板（2026-10-31）

工作台始终提供信息模块，Goal 仅在已有目标、已预备或用户主动打开时出现。SessionWorkbenchInformation 持有信息 DTO/渲染，容器管理每会话分组折叠、页签和主/子视图滚动。未知数据不伪造为零；观察时间变更不引发无内容变化的重绘。

文件变更也有独立折叠入口，内容复用原有 Files 页权威变更组件，折叠时仅显示标题。

composer 的目标行与专用 Goal 入口直接进入目标详情视图，展示完成条件、原生状态和支持的操作，不再先展示额度等信息。可返回会话信息，Esc 回到原入口。切换会话退出目标编辑；实时对账不覆盖正在输入的编辑草稿。

操作依据 capabilities、原生状态和 readback 可靠性显示：暂停/恢复、编辑或替换、清除、已完成后的新目标预备。Claude 的执行停止/继续有独立文案，完成目标不出现恢复按钮；缺失扩展或不支持的 transport 不展示可执行的伪操作。保存携带原生 revision 和支持的预算，失败保留草稿并显示原因。

目标图标直接复用 OpenChamber `d4a5a0ef13252fd60800c1a10c0eb08cc4aa15ff` 的 `components/icon/sprite.ts` 中 target / target-fill。路径保持原样，以缩放组适配 Obsidian 100×100 图标坐标。MIT 署名随 `assets/workbench/OPENCHAMBER-LICENSE.txt` 打包。
