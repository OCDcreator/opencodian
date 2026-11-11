# SettingsDshNativeWorkspace

源码：`src/features/settings/backends/dsh/SettingsDshNativeWorkspace.ts`

由 `SettingsDshSection` 组装的 DSH 原生配置任务工作区，归属 `feature.settings-shell`。模型、权限、上下文、工具、高级任务仅消费 `DSH_NATIVE_CONFIGURATION_GROUPS` 的审核字段，不自行扩展后端配置 schema。

## 2026-11-09 扩展归属配置页、跨任务导航与原生证据防护

- 扩展管理（`SettingsDshExtensionsWorkspace`）随批准的“配置与扩展”页挂载：`configuration` 任务按顺序渲染回读、会话默认值和扩展管理；`advanced` 不再渲染扩展，仅保留无公开字段的原生策略组，并以内容尺寸的跨任务链接（`data-native-task-links="advanced"`）指向模型页的唯一提供商编辑器（请求可靠性／流式超时／按提供商图像预算）和配置页的可选官方终端 bundle。链接只在 tabbed 宿主注入 `navigateTask` 时渲染；堆叠 section 面无标签栏，不渲染死链接。导航由 `SettingsTabbedRenderer.switchToPrimaryTab('dsh', task)` 完成，草稿以稳定 host 身份跨导航保留。
- 原生证据行的“读取当前状态”与“重新连接并应用”仅在 native 传输可用：ACP 下两者禁用，说明文案如实声明 ACP 启动应用边界、原生生效值／状态／静默期 RPC 不可用，并给出“先结束会话与后台任务，再通过标准宿主入口重载本插件”的下一步指引。回调同时校验当前传输与渲染 generation：传输切换或 dispose 后的残留点击不再发起 RPC，也不误报 `reconnectFailed`；按钮仅在当前渲染仍挂载且仍为 native 时恢复可用。原生重连成功后仍走真实 refresh（重新回读并重绘），`finally` 之后按钮可用性由 generation 决定。
- 凭据行渲染委托给 `SettingsDshNativeFields.renderDshNativeCredentialRow`（见其模块页）：workspace 只提供绑定当次 generation 与传输的端口（available/stale 谓词 + describe/set/unset RPC），端口仅在可用且未过期时被调用。

- `DshNativeSettingsPort` 是可选方法的窄适配器接口；ACP 可保存启动覆盖值，但不伪造原生运行回读或凭据管理能力。
- `backendSettings.dsh.nativeConfig` 保持 `{version:1, overrides}` 稀疏结构。字段省略表示继承；组级恢复继承移除命名空间。简单标量在 change 时自动保存；对象、映射、数组按组事务保存，无页面级全局 Save。
- 以稳定 host 身份保存各命名空间草稿，跨任务页及 section 重建保留。写入通过共享队列串行执行；组级 revision CAS 检测外部修改，同时允许其他组先保存。失败恢复内存中的原设置，保留草稿供重试。
- 高级 JSON 一旦产生草稿，同组引导字段、继承重置及历史恢复会锁定，显示“先保存或放弃 JSON 草稿”说明；Save/Discard 仍可用。捕获阶段阻止旧增强下拉等控件发出的事件覆盖 JSON，合法和非法 JSON 均跨切页及 section 重建保留；保存成功或显式放弃后解锁。
- 成功保存后，将旧的规范化非敏感组快照写到机器本地 `BackendConfigRecoveryStore`。`SettingsDshNativeHistory` 复用此 store，负责校验后的差异预览、应用／取消与页面／草稿／历史有效性；`saveGroup` 在实际队列写入前再次检查恢复 guard 和预览保存修订，并保留原有回滚。连接、MCP、启动 env 和凭据值不会进入此历史。
- 权限页的 `defaultPlanMode?:boolean` 是插件拥有的新建原生会话默认值，继承／开启／关闭通过原生 select 交给既有下拉增强；单项修改自动保存并失败回滚，不写 nativeConfig、不重连，也不修改当前、恢复或分支会话。ACP 禁用控件并保留保存值，实际新建会话应用由 adapter 所有。
- 模型目录区分尚未加载、读取失败、已加载但缺失的保存模型。现有会话模型仍归聊天所有；行内模型覆盖由既有 helper 所有。自定义默认 provider/model 向 Fields 明确传入 transaction=true，使保存说明与原有配对事务行为一致，不误报为逐字段自动保存。
- 默认模型目录值保持 Native/ACP 的不透明 JSON 元组 `JSON.stringify([providerId, modelId])`（与 `DshAdapter` 相同格式）。`renderDefaultModel` 用文件内 fail-closed 解码器（恰好两个非空字符串的数组）按元组身份匹配已保存 route——不按标签匹配，也绝不按 `/` 拆分，provider/model id 内含 `/` 合法。目录项非法 JSON、元组形状不符或空段时仅保留展示，选择后回退到已持久化选择且不写入草稿；已保存但目录缺失的 route 经 `__saved__` 哨兵选项（不会与以 `[` 开头的目录元组碰撞）保持可见，可通过既有引导自定义组继续编辑，不修剪。继承（空值）只删除 provider/model，reasoningEffort 不受影响；稀疏 provider/model 对仍走自定义组配对事务。
- 原生 appliedRevision 仅表示进程应用修订。实际 forms / observations 来自 native effective 配置；字段覆盖比较不使用请求回声，不把凭据引用或插件头部引用当成可比较的密钥值。
- 凭据描述仅读取 configured/writable/source。密码输入只在直接 set 调用期间使用并立即清空，不进入草稿或历史。请求头凭据修改明确要求重连。
- `dispose()` 释放 native 和扩展订阅；generation 过滤旧请求回调。`SettingsTabbedRenderer` 负责在离开任务页或关闭设置时调用。

聚焦测试：`tests/unit/features/settings/backends/dsh/SettingsDshNativeWorkspace.test.ts`，覆盖保存、CAS、回滚、继承、组草稿、恢复、凭据隔离、ACP 和真实字段证据；`SettingsDshNativeWorkspaceDefaultModel.test.ts` 覆盖不透明模型元组的选择→保存→重开稳定、含 `/` 的 provider/model、畸形目录值不持久化、未知保存 route 可编辑与继承仅删 route。
