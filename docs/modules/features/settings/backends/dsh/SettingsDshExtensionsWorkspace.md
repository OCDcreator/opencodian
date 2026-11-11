# SettingsDshExtensionsWorkspace

源码：`src/features/settings/backends/dsh/SettingsDshExtensionsWorkspace.ts`

DSH 高级任务中的原生扩展包管理，归属 `feature.settings-shell`。将会执行包代码的操作与普通库配置编辑分开，使用 adapter 原生管理方法，不写包目录或执行 shell。

- 实际 list 返回 plugins/bundles/managed；控件同时检查 capability handshake、managed-profile 归属和每个条目的 readOnlyReason/removable/updatable。
- 目录描述把「配置文件中的选择」（enabled/disabled）与插件公开的 Loader `fiberPhase`（active/pending/loading/failed/unloading/null）以及 bundle 公开的 `availability`（installation/profile/missing）分开呈现，不把 enabled 单独当成已加载证据。字段缺失或取值无法识别时显式显示 unknown/notLoaded/availabilityUnknown；bundle 带 `error` 时只显示通用的“可能被跳过”文案；readOnlyReason 存在时在 selection 与运行状态之后追加保护标记。全部状态使用固定的 `settings.dsh.native.extensions.catalogState.*` 文案，不输出原始 diagnostic、错误码、路径或构建元数据；mutation 结果消息仍与运行目录状态分开呈现。
- 支持插件和 bundle 启停、inspect、versions、install、update、remove、cancel 与精确版本 exemption。参数采用 native flat DTO，不构造虚假 session ID。
- 每次 mutation 前用户需勾选下一次扩展变更授权；动作开始后清除授权。exempt 还传递 `acceptRisk:true`。安装使用明确 spec、saveExact 和逐包 approvedBuilds；URL 与版本只作为用户选择传递。
- 运行操作有独立 operationId，订阅对应的原生进度事件；install/update 可按 ID 取消。操作身份按稳定 host 保留。原生结果返回后先标记 settled，忽略排队的进度与迟到的取消响应，权威目录回读结束后释放操作状态。generation 防止旧页面、旧 toggle 回调与释放后的异步结果写入 DOM；切页重建的实例使用自己的 generation 等待该操作完成并重新回读。
- mutation 仅解析匹配 operationId 的服务 envelope.result。直接 ChangeResult 校验 application、changed、stage、target；update 另外校验 from/to/step 并读取嵌套 result/restore，不能把成功的 remove 步骤或恢复旧版本当作目标更新成功。
- 结果分别呈现 applied、unchanged、saved-await-restart、overridden、failed、cancelled 和 unknown/unconfirmed。更新失败或取消后，旧版本恢复成功、已保存但需重启、恢复未确认分别显示；所有结果只使用固定的 `settings.dsh.native.extensions.result.*` 文案，不输出 error、pendingBuilds、包日志、路径或恢复诊断。
- `mutate(): Promise<boolean>` 的 true 仅表示原生已接受目标变更（applied 或 restart-required），不代表所有运行行为已验证。overridden、failed、cancelled、未知结果及更新恢复旧版本均为 false；可见开关始终来自重新读取的目录，不把请求值回显为运行证据。
- 活跃页面在正常返回、未知结果和 RPC 异常后都重新读取目录；目录读取失败独立提示并禁用陈旧快照上的后续写操作，刷新可重试。请求序号防止更早的目录读取覆盖新结果；重读不清空最终操作反馈。授权复选框、原有布局与每次操作消耗授权的行为保持。
- 可选终端等能力通过可信原生 bundle 安装入口完成，聊天深链指向 Advanced。

聚焦测试：`tests/unit/features/settings/backends/dsh/SettingsDshNativeWorkspace.test.ts` 的管理归属、授权、精确参数、检查、版本、安装、取消和释放订阅场景；`tests/unit/features/settings/backends/dsh/SettingsDshExtensionsOutcome.test.ts` 通过真实 Setting 回调与原生 envelope 覆盖全部 application、update 恢复矩阵、异常/畸形结果、错误元数据不输出、权威开关回读、进度/取消时序、generation/dispose/remount、双语结果文案，以及目录运行状态矩阵（全部 fiberPhase、null/缺失/未知值、enabled 与 notLoaded 并存、bundle availability 三态与缺失、bundle error 通用脱敏文案、保护标记与写门控保持）。
