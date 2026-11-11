# SettingsPiProvidersSection

> 源码: src/features/settings/backends/pi/SettingsPiProvidersSection.ts

Pi models.json配置界面。结构化provider/API/认证表达式、模型ID/名称/思考/输入/预算/价格；headers、compat、thinkingLevelMap、modelOverrides折叠编辑。全量JSON编辑器保留未来字段。认证表达式输入为password，官方ModelRegistry校验不执行命令取密钥。

增加/删除模型前收集已有编辑，JSON保存后重建结构化表单，避免旧快照覆盖新配置。保存带revision并备份；原子替换由配置服务承担。重连后模型/请求设置生效，不改变其他后端。

测试：SDK脚本验证官方schema、备份和冲突；Test Vault覆盖表单和导航。

卡片间距由共享opencodian-settings-form-stack容器管理：provider选择器、嵌套editor、保存按钮与原生JSON区域都保留12px间隔，不能依赖setting-item相邻选择器。空状态提示不占用间距，新增/切换provider及动态模型重绘沿用相同布局。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/backends/pi/SettingsPiProvidersSection.ts`。
- 原位置：`src/features/settings/SettingsPiProvidersSection.ts`；文件名、导出接口与业务职责保持不变。

## 2026-11-08 会话级撤销历史（内存边界）

models.json 编辑器每次成功保存（结构化编辑与原生 JSON 编辑共用 `save`）会把保存前的完整文档压入**插件生命周期 WeakMap**（按 adapter 键，最多 5 条）。这是对“编辑器 ≤3 次点击回滚”的会话级兜底，边界须明确：**仅存在于内存、绝不持久化、绝不写入仓库**（文档内嵌 apiKey 表达式，Pi SDK 1.5.0 经 bundle 实测对 save_configuration/save_model_configuration 只有锁内直写、无归档钩子），Obsidian 重载即消失。UI 明确标注「仅本会话，内存中」。恢复 = 打开 disclosure → Restore → Confirm（3 击），通过当前 revision 的 `save_model_configuration` 写回（与手动保存同一条 revision 校验路径）。历史 disclosure 挂在编辑器 body 之外，编辑器重渲染不丢列表。若 core 后续落地持久化原生历史 API，本层应改为 feature-detect 优先原生、保留内存 fallback。

## 2026-11-08b 原生持久归档优先（feature-detect）

adapter 具备 `supportsConfigurationHistory`/`getConfigurationHistory`/`restoreConfiguration`（core 冻结 API）时，历史 disclosure 改为读取持久原生归档（`~/.opencodian/pi-configuration-history`，有界 5 条，仓库之外）：条目含 index/savedAt/revision/bytes，来源徽章「持久原生归档」；恢复经 `restoreConfiguration({target:'models', index, archivedRevision, revision})` 带当前文档 revision 校验，响应为新鲜 save 形态文档并重渲染。旧资产或探测失败回退到内存会话撤销（标签「会话内存（重载后丢失）」），两条路径的 stale 失败一律显示「无法恢复……请刷新版本后重试」+ 刷新按钮，绝不把原始 CLI 错误文本写入 DOM，也不做过期覆盖。两条路径都保持 ≤3 击（打开→恢复→确认）。
