# SettingsPiProvidersSection

> 源码: src/features/settings/SettingsPiProvidersSection.ts

Pi models.json配置界面。结构化provider/API/认证表达式、模型ID/名称/思考/输入/预算/价格；headers、compat、thinkingLevelMap、modelOverrides折叠编辑。全量JSON编辑器保留未来字段。认证表达式输入为password，官方ModelRegistry校验不执行命令取密钥。

增加/删除模型前收集已有编辑，JSON保存后重建结构化表单，避免旧快照覆盖新配置。保存带revision并备份；原子替换由配置服务承担。重连后模型/请求设置生效，不改变其他后端。

测试：SDK脚本验证官方schema、备份和冲突；Test Vault覆盖表单和导航。
