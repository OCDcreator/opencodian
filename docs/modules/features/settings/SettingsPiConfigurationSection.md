# SettingsPiConfigurationSection

> 源码: src/features/settings/SettingsPiConfigurationSection.ts

Pi 原生 settings.json 表单，按项目/全局作用域读取51项官方字段schema。作用域、原始文件路径、继承值、SDK/终端/导出范围明确展示。字段变更收集为patch，保存携带revision，由独立配置服务验证/备份/冲突检测。高级JSON支持未知字段。

保存只持久化；重连按钮由用户执行，停止Pi操作后重建服务。切换作用域保留当前表单草稿；未编辑字段不写回默认。错误保留输入并显示，不假装已应用。

测试：SettingsPiSection.test.ts、scripts/pi-sdk-acceptance.mjs、Test Vault设置页验收。

原生表单使用共享opencodian-settings-form-stack，以12px容器gap覆盖作用域选择、字段、状态与保存操作；切换作用域和保存后重绘保持该契约。空live region保留挂载但不产生额外空行。
