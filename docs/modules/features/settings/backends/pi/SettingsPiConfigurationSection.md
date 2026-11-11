# SettingsPiConfigurationSection

> 源码: src/features/settings/backends/pi/SettingsPiConfigurationSection.ts

## 2026-11-12 原生工作区任务归属

`attachResources()` 在独立资源任务中读取同一 `get_configuration` 快照，允许项目/全局切换，列出 resources 组 schema，但不生成结构化输入；唯一修改入口是既有完整 settings.json raw editor，保存继续携带当前 revision。`attachAdvanced()` 现在由“会话 / 高级”任务调用，保留 advanced 字段、raw editor 和原生/内存历史。模型与执行组仍由 `attach()` 差量保存；51 字段的 scope、继承、生效和 raw 覆盖不变。

Pi 原生 settings.json 表单，按项目/全局作用域读取51项官方字段schema。作用域、原始文件路径、继承值、SDK/终端/导出范围明确展示。字段变更收集为patch，保存携带revision，由独立配置服务验证/备份/冲突检测。高级JSON支持未知字段。

保存只持久化；重连按钮由用户执行，停止Pi操作后重建服务。切换作用域保留当前表单草稿；未编辑字段不写回默认。错误保留输入并显示，不假装已应用。

测试：SettingsPiSection.test.ts、scripts/pi-sdk-acceptance.mjs、Test Vault设置页验收。

原生表单使用共享opencodian-settings-form-stack，以12px容器gap覆盖作用域选择、字段、状态与保存操作；切换作用域和保存后重绘保持该契约。空live region保留挂载但不产生额外空行。

2026-10-02 T07：choice 字段已存值未列入当前 schema 时仍保留显式选项（例如 max），标记“已保存值”，不默默改成 inherit/default；保存仍仅发送已编辑字段差量。PiClaudeSessionControlsUI.test.ts 验证旧 schema 下 max 保留和未知字段不进入差量；PiThinkingAndConfiguration.test.ts/.mjs 直接调用真实配置服务，以隔离文件 fixture 验证 schema max、未知根/嵌套字段差量和完整 JSON roundtrip、revision conflict 与失败不覆盖。静态允许 max 持久化不代表每个模型支持 max。

2026-10-02 PC1 补修：表单显示已有未知 choice 之后，配置 handler 允许该值完全未变时随其他字段保存，不再因静态 schema enum 阻止无关编辑。完整 JSON 同策略；新增/改变 unknown enum 不允许。PiConfigurationEnumRoundtrip.test.ts/.mjs 直接调用真实 handler 验证 6 个 enums、双作用域、patch/完整文档和拒绝保护，UI 本轮未改。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/backends/pi/SettingsPiConfigurationSection.ts`。
- 原位置：`src/features/settings/SettingsPiConfigurationSection.ts`；文件名、导出接口与业务职责保持不变。

## 2026-11-08 多组渲染 + 高风险 advanced disclosure + 原生 radio

`attach(container, groups)` 接受单个 group 或数组（向后兼容字符串），按 SDK 返回的 field.group 过滤并按组分节渲染；运行时无该组字段时显示如实提示（该 Pi 版本未暴露字段）。boolean 与带 options 的字段改用 `addBackendChoiceSetting` 原生 radio（继承值 '' 不在选项中时由 helper 渲染为 unlisted 禁用项）；string/number/list/json 仍为 input/textarea。每个字段行带 `describeBackendSetting` 徽章：scope=当前作用域选择器值（global/project）、effect=new-session、来源=字段 scope 标注；execution/advanced 组 risk=high。新增 `attachAdvanced(container)`：把 advanced 组字段与原始 settings.json 编辑器渲染进独立的高风险 disclosure（摘要 + 警示文案，data-pi-section=advanced），供 execution 页调用——原生执行类设置（tools/extensions/commands）不与普通模型页混排。保存仍走 revision 校验的 save_configuration；草稿 per-scope 缓存行为不变。

## 2026-11-08b settings.json 作用域历史 + 空字段重试

advanced 上下文新增 settings 历史 disclosure：原生契约可用时按当前作用域（global/project）列出 `getConfigurationHistory().settings[scope].entries` 并经 `restoreConfiguration({target:'settings', scope, index, archivedRevision, revision})` 恢复（重取 get_configuration 后重渲染）；不可用时回退到内存会话撤销——每次成功的 save_configuration（字段保存与原始编辑器保存共用）先把保存前的完整 scope 文档压入按 adapter 键的 WeakMap（每作用域 5 条，仅内存、绝不持久化、绝不入仓库）。所有恢复 ≤3 击、revision 校验、stale 显示分类文案+刷新。无该组字段时提示重试（刷新按钮在上方），不渲染虚构字段。advanced disclosure 仍未并入普通模型页。

## 2026-11-08c 评审修复：显式继承 + 51 字段后果/标签映射

布尔与枚举字段新增显式可选的 '' 「使用 Pi 默认值」选项（settings.pi.inherit，双语已有）：未设置字段渲染为选中且可用的继承项，不再是禁用的 unknown 回退；用户选回继承后 drafts 记 ''，collectChanges 沿用 '' → null，经 revision 校验的 save_configuration 清除覆盖（真实服务语义由 PiConfigurationEnumRoundtrip PC2 用例证明：项目覆盖写入 → null 清除 → 全局值原样保留并生效）。未知非空保存值仍渲染为勾选且禁用的 unlisted 项，绝不自动写入或改写。字段描述改为按路径映射的一句话后果（51 条，来源 assets/pi/configuration.mjs SETTINGS_FIELDS 与 backend-fields-pi.md 表 G；表外/未知字段一律使用「高级原生字段：{{path}}」诚实回退，不伪装分组覆盖）；原始字段键降级为描述内 `.opencodian-pi-field-key` 次要标记。字段名经 settings.pi.label.*（51 键，与 consequence 同源）本地化，未映射字段回退 SDK label，二者皆缺才退回 path。继承展示徽章对字符串值显示原值（不再 JSON 引号包裹）。project 作用域下空白=继承全局或内建默认的语义在后果句中如实表述，不声称 project 提供值。作用域选择器、原生历史、继承徽章与 raw editor 全部保留；无自动写入。
