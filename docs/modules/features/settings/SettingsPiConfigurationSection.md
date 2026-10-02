# SettingsPiConfigurationSection

> 源码: src/features/settings/SettingsPiConfigurationSection.ts

Pi 原生 settings.json 表单，按项目/全局作用域读取51项官方字段schema。作用域、原始文件路径、继承值、SDK/终端/导出范围明确展示。字段变更收集为patch，保存携带revision，由独立配置服务验证/备份/冲突检测。高级JSON支持未知字段。

保存只持久化；重连按钮由用户执行，停止Pi操作后重建服务。切换作用域保留当前表单草稿；未编辑字段不写回默认。错误保留输入并显示，不假装已应用。

测试：SettingsPiSection.test.ts、scripts/pi-sdk-acceptance.mjs、Test Vault设置页验收。

原生表单使用共享opencodian-settings-form-stack，以12px容器gap覆盖作用域选择、字段、状态与保存操作；切换作用域和保存后重绘保持该契约。空live region保留挂载但不产生额外空行。

2026-10-02 T07：choice 字段已存值未列入当前 schema 时仍保留显式选项（例如 max），标记“已保存值”，不默默改成 inherit/default；保存仍仅发送已编辑字段差量。PiClaudeSessionControlsUI.test.ts 验证旧 schema 下 max 保留和未知字段不进入差量；PiThinkingAndConfiguration.test.ts/.mjs 直接调用真实配置服务，以隔离文件 fixture 验证 schema max、未知根/嵌套字段差量和完整 JSON roundtrip、revision conflict 与失败不覆盖。静态允许 max 持久化不代表每个模型支持 max。

2026-10-02 PC1 补修：表单显示已有未知 choice 之后，配置 handler 允许该值完全未变时随其他字段保存，不再因静态 schema enum 阻止无关编辑。完整 JSON 同策略；新增/改变 unknown enum 不允许。PiConfigurationEnumRoundtrip.test.ts/.mjs 直接调用真实 handler 验证 6 个 enums、双作用域、patch/完整文档和拒绝保护，UI 本轮未改。
