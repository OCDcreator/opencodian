# PiExtensionUiHost

> 源码: src/features/chat/services/PiExtensionUiHost.ts

## 职责

适配九种标准 RPC UI：select、confirm、input、editor、notify、setStatus、setWidget、setTitle、set_editor_text。四种 dialog 由用户回复/取消；请求 AbortSignal 关闭对应 Modal，完成标记防止重复完成。其余五种方法不要求 UI response，PiSessionRuntime 仍负责协议回包分类。

setStatus 按 statusKey 更新输入区状态文本；省略/undefined/空串清该 key，其它 key 保留。setWidget 接受 string[]，按 widgetKey 替换、清除；默认 aboveEditor，支持 belowEditor，同 key 改 placement 移动现有节点。行以换行保留；空数组不占可见空间。所有内容经文本 DOM API 显示，不执行 HTML/Markdown 或组件工厂。

setTitle 映射为同 view 既有 header 下方的可见 transient 文本，空串隐藏。此映射不更新 OS/terminal title、container aria-label、持久 tab title、conversation.title 或 native session metadata，不触发 rename/save。set_editor_text 只更新同 Pi session 的打开 leaf 输入框并触发其所属 document 的 input event，不动其它会话草稿。

## 临时状态与生命周期

App 身份隔离的弱引用状态按 sessionId 保存当前连接 AbortSignal 的 status/widget/title 投影；它不是历史或 native 会话真值。每连接一个 abort listener。替换先释放旧投影/监听并标记旧 signal retired；已 aborted/retired 的请求无法夺回新连接，迟到 abort 只能清理自己仍拥有的投影。

syncPiUiView 在既有 View 身份切换与 layout/hydration 接缝同步 DOM；切到其它会话、backend 或空身份卸下旧节点，回到 live Pi session 显示最新临时投影。同 session 打开 leaf 全部同步。releasePiUiView 在关闭时只解绑并标记该 container 已关闭，后续事件不重挂；其它 leaf 和共享 native runtime 仍 live。连接 abort 清该连接所有绑定，新连接不继承旧内容；DOM 重建可重投影仍 live 内容，不声称从 history 恢复 transient UI。

host 不创建 ResizeObserver、轮询器或滚动调度；输入区高度沿用现有 composer observer/layout metrics。重复 sync 保持节点与顺序，不每次 rebuild。终端 custom/component factory 仍不支持；公共 custom message 与 custom TUI 不等价，本模块不接管其 native history/notice 路线。

## 验证

focused host/View 测试覆盖可见文本、key/placement/清除、同 key 跨 App/session、多 leaf、tab/backend/null 回切、连接替换/旧 signal、关闭/DOM 重建与节点幂等。既有 Runtime 接到实际 host 时，五类 fire-and-forget 零回包，四种 dialog 成功/用户取消各一次，native cancel 与 OAuth lifetime 回归。

代码测试不代替真实安装 SDK/两机 UI 证据。原 I11 startup ask、完整 cancel lifecycle、custom message 仍按独立条款验收，九方法结果不外推整 I11。

OAuth URL notices retain a request-ID scoped abort lifetime without a protocol response. Native login settlement cancels oauth-link, hides the authorization link, and releases its listener; ordinary timed notifications are unchanged.
