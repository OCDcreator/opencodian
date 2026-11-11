# SettingsDshExtensionSettings

源码：`src/features/settings/backends/dsh/SettingsDshExtensionSettings.ts`

实际已加载扩展的原生公开字段编辑器，归属 `feature.settings-shell`。核心审核 namespaces 仍由 vault nativeConfig 所有；本模块只接受 config.describe 返回的扩展 namespace，不提供任意 namespace 输入。

- 解析原生 z schema 的 `uid`、`refs`、`dict`、`meta`、union 常量，渲染公开 scalar 及有界枚举。返回表单已由原生 volatileForm 筛选，不依赖已被 plainSchema 去除的 volatile 标记。
- capability `configuration.extensionSettings.mutate`、form `writable:true`、`persistenceSource:managed-profile` 和数字 revision 全部满足才显示编辑控件。
- 排除 secrets 路径、敏感名称和 readonly meta；复杂或未知 schema 分支保留回读值并精确说明缺少编辑支持，不生成未经审核的写入。
- 每个扩展表单保存自己的 set/unset 操作草稿，携带 `expectedRevision` 调用 native mutation。bridge 继续负责目录归属、实际 Config metadata、秘密检查及 CAS。
- 成功后检查 persistence/application/readback 证据，重新读取表单；仅全部 verified 且有 form 时显示原生已确认。缺失的应用或回读证据明确为待验证；冲突与失败保留草稿。
- 持久化范围是此库专属的机器本地 managed profile，不写入普通库 overrides 或其恢复快照。

聚焦测试：`tests/unit/features/settings/backends/dsh/SettingsDshNativeWorkspace.test.ts` 的实际 ref schema、敏感字段排除、set/unset、CAS 和失败证据场景。
