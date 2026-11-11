# SettingsDshNativeHistory

源码：`src/features/settings/backends/dsh/SettingsDshNativeHistory.ts`

归属 `feature.settings-shell`，拥有原生配置组的机器本地恢复预览。复用注入的 `BackendConfigRecoveryStore`，不实现新的文件读写或运行时应用路径。

- 从库路径和 namespace 派生历史身份；读取时固定条目修订号，并使用 core 原生配置验证器校验快照，拒绝跨 namespace 或敏感／非法字段，校验前不显示值。
- Restore 只打开当前保存值与备份值的逐字段差异预览。预览是只读路径：引导草稿允许保存进行中的非法值（字段级反馈提示，保存时 fail closed），因此草稿不参与 schema 校验、也不会阻止预览，只在有未保存草稿时显示替换警示；备份快照本身仍必须通过同一校验，非法或含敏感值的备份在显示前即被拒绝。预览、取消不修改设置、草稿、历史或运行进程。
- 用户显式 Apply 后才调用 workspace 保存队列。预览保存了配置修订（校验性 CAS）、草稿内容令牌（非校验性，仅用于漂移检测，非 JSON 内容按 fail closed 处理）和历史修订；`current()` 在实际排队写入前再次读取校验，并检查页面 generation 与 JSON 草稿锁。过期预览只显示冲突，不能写入。恢复始终写入验证过的备份快照值，应用后草稿被该快照替换。
- Cancel 移除预览并使旧按钮失效；切页／关闭后的按钮及队列恢复失效。外部配置变化、历史轮换、新草稿都要求重新预览。
- 实际设置写入、失败回滚和旧配置归档继续由 `SettingsDshNativeWorkspace.saveGroup` 所有；恢复失败保留原引导草稿，成功保存也不自动重连或修改当前会话。
- 外层 workspace 的 raw-draft inert/事件捕获保护仍覆盖历史列表、预览及应用，不能利用历史绕过未提交 JSON。

聚焦验证：`tests/unit/features/settings/backends/dsh/SettingsDshNativeHistory.test.ts` 覆盖预览只读、取消、显式应用、配置／历史 CAS、最终队列 CAS、raw 锁、失效页面、敏感快照拒绝和保存失败回滚。
