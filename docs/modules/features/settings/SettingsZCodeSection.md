# SettingsZCodeSection

> 2026-09-22（二轮核查修复）：provider 计数为 null 时改显示「provider 数量不可用」（`settings.zcode.status.providerValidatedNoCount`），不再把未知折成 0。

> 2026-09-24 (票 06)：新增默认模型/思考级别/模式三项持久化默认字段；重连按钮追加 invalidateSlashCommandCatalog（设置/运行时变化后斜杠目录即时失效而非等 120s TTL）。

> 源码: src/features/settings/SettingsZCodeSection.ts

## 职责

ZCode 后端的设置面（经典布局与页签布局共用）：可选运行时覆盖路径（留空=自动发现官方安装）+ 诚实的 ready / unavailable / failed 诊断三行（运行时解析、provider 配置、连接/能力握手），以及重连按钮（stop→start，仅影响 OpenCodian 自有 app-server 进程）。

诊断数据来自 `ZCodeAdapter.getRuntimeDiagnostics()` 快照；不持有运行时状态本身。路径显示省略 home 前缀。文案走 `settings.zcode.*` 双语键。

## 验证

设置面为薄 UI 层；其数据契约由 ZCodeAdapter 测试覆盖。渲染挂接于 SettingsTabbedRenderer（zcode 主页签）与 OpenCodianSettings / OpenCodianSettingsView（经典布局）。
