# SettingsZCodeModelControls

> 源码: src/features/settings/backends/zcode/SettingsZCodeModelControls.ts

新对话默认模型、原生思考选项、执行方式与自动续写模型的展示 owner。模型来自真实目录，按服务商分组、可搜索、键盘导航、Escape 关闭后恢复焦点。旧模型/思考值不在目录时保留；目录失败不写设置，可重试、重选或显式恢复默认。auto 只显示为未确认旧值，禁止重新选择。

思考选项通过临时 draft 查询所选模型，不污染真实会话或桌面默认。续写模型存 inlineCompletionModelOverrides.zcode，启用开关留在统一设置页；入口由宿主回调导航。每次字段保存重新合并当前 host 状态。迟到加载以 epoch 拒绝，保存失败保留 UI 可恢复操作。

验证：SettingsZCodeSection.test.ts 覆盖经典/标签宿主、搜索分组/选择、最新状态合并、空/失败与失效值、迟到响应、单独续写模型、保存失败和焦点恢复。

Kimi 复审后：保存失败回滚 host 当前字段并恢复控件，不覆盖其他更新；模型搜索实现 combobox/listbox/activedescendant 与结果公告，支持 Enter/Tab/Escape 和焦点恢复。恢复默认按钮提供对象名称。

ZCode 补全文案明确 Alt/快捷键触发，与统一开关保持一致；未单独选模型时沿用统一补全解析规则，避免误称输入时自动触发或固定跟随聊天。

零匹配时仅公告修改搜索词的恢复指引，不展示键盘选择动作；共享配置读取失败有专属文件读取与未写入说明。
