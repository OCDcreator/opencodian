# SettingsZCodeSection

> 2026-09-22（二轮核查修复）：provider 计数为 null 时改显示「provider 数量不可用」（`settings.zcode.status.providerValidatedNoCount`），不再把未知折成 0。

> 2026-09-24 (票 06)：新增默认模型/思考级别/模式三项持久化默认字段；重连按钮追加 invalidateSlashCommandCatalog（设置/运行时变化后斜杠目录即时失效而非等 120s TTL）。

> 源码: src/features/settings/SettingsZCodeSection.ts

## 职责

ZCode 后端的设置面（经典布局与页签布局共用）：可选运行时覆盖路径（留空=自动发现官方安装）+ 诚实的 ready / unavailable / failed 诊断三行（运行时解析、provider 配置、连接/能力握手），以及重连按钮（stop→start，仅影响 OpenCodian 自有 app-server 进程）。

诊断数据来自 `ZCodeAdapter.getRuntimeDiagnostics()` 快照；不持有运行时状态本身。路径显示省略 home 前缀。文案走 `settings.zcode.*` 双语键。

## 设置合并与保存

`executablePath`、`model`、`thinkingLevel`、`mode` 的初始控件值使用渲染时的规范化快照。每个 `onChange` 必须重新读取 `host.settings.backendSettings.zcode`，规范化当前状态，再合并并规范化本次字段输入；不得展开渲染时捕获的旧快照，否则连续修改 model → thinking 会复原 model。

合并结果在调用和等待 `host.saveSettings()` 前同步写回 host。这样快速输入、清空字段、设置对象被替换，以及多个保存 Promise 按不同顺序完成时，组件都保留最新的其他字段。组件不保存第二份可写状态，也不拥有持久化队列；磁盘写入与运行时应用仍由 host 负责。

## T09 管理面（2026-10-02）

实际入口：经典设置 OpenCodian → ZCode → Connection；页签设置 ZCode → Connection；同一 body 中 `[data-settings-target="zcode-management"]` 挂接 Plugins, MCP and hooks。

目录由当前 adapter 的 `getManagementCatalog` 读取，不启动 session/model。项目声明统计、plugin effective 配置、MCP status 和 hooks unavailable 分开。只有 live 方法探测成功、项目 snapshot 可读且插件包存在时，项目插件开关才可编辑；携带完整 FileRevision 调用 `setManagedPluginEnabled`，保存后刷新目录并显示三个独立证据轴。磁盘持久化成功时 invalidateSlashCommandCatalog；不向 plugin settings 增加第二份 plugin declaration store。

同页开关先禁用，成功或冲突后重新读取原生目录；throw 时恢复旧控件并显示失败。刷新 epoch 丢弃旧目录响应。MCP 连接状态不等于认证，hooks 声明数量不等于执行。运行时精确方法缺失为 unavailable，不显示虚构 effective 值。没有独立 hooks/MCP mutation 时不渲染相应编辑器。

`settings.zcode.management.*` 的 EN/中文 keys 已交 parent；本任务禁止修改 locale 文件，代码在 keys 尚未落地时使用英文 fallback。既有 description 的“不改配置”旧文案也已交 parent 修正为“全局配置只读，项目插件覆盖安全写入”。

## 验证

组件回归测试：`tests/unit/features/settings/SettingsZCodeSection.test.ts`，覆盖经典和页签布局的同页连续四字段修改、各字段合并替换后的最新规范化状态、快速输入和清空、保存入口收到的快照顺序、保存 Promise 正序/逆序完成，以及当前设置缺失时的默认值。

这些四字段测试证明组件状态合并与保存调用语义，未证明该四字段的真实磁盘持久化、原生 application/runtime readback 或 Obsidian 实机 UI 验收。T09 的 `SettingsZCodeSection.management.test.ts` 另外覆盖经典/页签的管理面挂接、插件 mutation revision 参数、native 目录刷新/reopen、application pending 展示、unavailable 禁用；管理 owner 有独立磁盘回归和 installed 0.16.9 隔离 native effective 回读（详见 ZCodeManagementService 模块页）。适配器数据契约仍由 ZCodeAdapter 测试覆盖。渲染挂接于 SettingsTabbedRenderer（zcode 主页签）与 OpenCodianSettings / OpenCodianSettingsView（经典布局）。

2026-10-02：管理目录的声明数量、插件来源/包缺失、MCP 状态/工具数量/认证状态以及保存三轴结果均使用共享 locale 模板；原生状态 token 继续保留在 backend evidence 中，显示层只翻译已知值。
