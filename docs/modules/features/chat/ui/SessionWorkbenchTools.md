# SessionWorkbenchTools

> 源码：`src/features/chat/ui/SessionWorkbenchTools.ts`
> Owner：feature.chat-ui

## 职责与边界

三个独立工作面（工作区终端、浏览器与预览、仓库）加资源面板的共享外壳。仓库工作面的快照、草稿、在途读取与代际全部在 `SessionWorkbenchRepository`，本模块只提供工具级 UI 结构（工具头、状态簇、每工具错误区、主/次操作区）并通过 `mount / update / show / refresh / detach` 窄接口组合它；错误呈现以 4 个回调（button/enable/showError/clearError）注入，Repository 不反向 import 本模块。SessionWorkbenchDesktopView 复用同一宿主 runtime，在 Obsidian 主区域打开大内容；关闭视图只卸 UI，不终止 PTY。

工作区终端是本插件宿主 runtime 的 PTY，与 DSH 原生会话终端（任务页/信息面板）不同源。头部状态只反映当前会话的进程（状态、目录、PID）；Start/Stop 是显式点击，视图的 attach/detach 不 spawn、不重启、不杀进程；跨关闭与切换保留 PTY，重进会话或重建卡片时仅重新附着已有视图。其他会话的进程折叠在“此工作台的其他进程”里，只显示来源、目录、状态与 PID，从不显示其错误或输出；终端挂载点带 `data-workbench-native-keys="true"`，外层 Escape 处理据此把按键留给 PTY。

浏览器面板按会话记忆 URL；预览有 empty/loading/ready/failed 状态，截图按钮在 DOM-ready 且 `capturePage` 可用前禁用；地址表单中的 Open 是唯一填充主操作，附加页面与截图为提示行下同一行的 28px 描边操作，Obsidian 打开为仅图标操作（aria-label/title 可访问名保留）。所有 webview 事件经“仍是同一预览节点 + 同一会话访问”门禁；迟到截图不落库也不写错误。资源面板可被 `mountResources(parent)` 移入主表面的稳定挂载点（幂等、可重建、destroy 才解除）：inline 模式只保留“命令与技能”目录与“相关设置”分组，不重复渲染草稿附件（附件归信息面板的会话引用）；`openTool('context')` 兼容旧调用，inline 时打开并聚焦目录、不改变工具页。`invalidateCatalog()` 供设置侧命令缓存失效时调用：所有会话缓存按代（epoch）作废，打开中的目录恰好合并补读一次，关闭中的下次展开再读，搜索词/展开/焦点不动。

2026-11-11 搜索与目录样式：目录与其他信息分组共用向下 chevron 和单框展开语言；搜索 label 不含重复可见标题，输入保留 aria-label 与 placeholder，独立搜索图标以 32px 输入框为定位上下文并垂直居中，避免宿主行内 label 或 SVG 默认样式把图标挤出输入框。目录标题承担 flex 剩余宽度，计数与 chevron 同其他摘要项一样靠右，不再双 auto margin 把计数挤到中间。

2026-11-11 二级面板 v2：工作区终端的空状态拥有居中的图标、标题、说明与主启动按钮，PTY 附着后仍切换为真实 xterm 和工具行 Stop；启动只改变展示位置，不改变 runtime 生命周期。浏览器对齐参考稿 `session-workbench-secondary-v2.html`：地址表单、预览空/加载/失败状态与独立操作区的组合不变，截图门禁与真实 webview 事件不变；呈现修正为——附加页面按钮改用语义短键 `workbench.browser.attachPage`（不再复用全局 attach 标签），空状态用平静的 `workbench.browser.empty` + `emptyDescription` 说明、与进浏览器错误区的 `workbench.browser.invalidUrl` 分开（loading 态说明显示当前地址，failed 态标题用 `openFallback`）；Open 为填充主操作，主工作区入口从工具栏移到地址标签旁的仅图标按钮（可访问名仍来自 `workbench.desktop.open`）。三个二级页面隐藏概览级刷新按钮，局部操作继续由各工具自己拥有。

错误按工具与会话访问（lease = 会话代 + identity）归属：迟到的失败若属于别的会话或更早一次访问则被丢弃；失败详情经 `failureDetail` 单行化、去 ANSI、去凭据并限长。按钮在点击时捕获 lease，异步失败不会污染新会话。

## 验证

`tests/unit/features/chat/SessionWorkbenchTools.test.ts`：工具切换无二级选择器；主区域视图按所选工具命名；浏览器按会话隔离 URL/预览、迟到截图静默丢弃、无效地址只进浏览器错误区；终端头部状态与 Start/Stop 互换、其他会话进程折叠且不泄漏其错误、重附着不 spawn、订阅迟到事件按视图身份丢弃；仓库组合（一次读取、非仓库本地化状态、提交校验只进 git 错误区）；资源面板 inline 契约、目录懒加载/搜索/会话作用域、`invalidateCatalog` 的合并补读与关闭目录下次展开读取、强制刷新跨 A→B→A 不丢补读。

Repository 自身的行为与竞态测试见 `docs/modules/features/chat/ui/SessionWorkbenchRepository.md`。聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁；真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`，未验收能力不得由单测替代。
