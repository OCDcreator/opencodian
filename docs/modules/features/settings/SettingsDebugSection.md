# SettingsDebugSection

> **源码**: `src/features/settings/SettingsDebugSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsDebugSection` 是 settings/debug 分区的厚 owner。它从 `OpenCodianSettings.ts` 接管 debug section 的完整 lifecycle：debug logging toggle、inline serialized args toggle、log path picker、diagnostic copy/generate action，以及 console help block。

这个 owner 的职责边界保持在“**debug section 装配 + path/export orchestration**”：

- 持有 debug section heading、toggle、text input、button 与 help block 的组装
- 统一处理平台相关 log path placeholder/label、directory picker default path 与导出路径持久化
- 保持 diagnostic copy / file generation / debug logging snapshot 的既有语义与保存时机不变

## 核心逻辑

### section lifecycle 收束

`attach()` 会在一个 owner 内完成 debug section 的全部挂载流程：

- 创建 debug section heading
- 注册 debug logging 与 inline serialized args toggle
- 注册 log path text input 与 choose-directory action
- 注册 diagnostic copy / generate action
- 渲染 console help block

这样 `OpenCodianSettings` 不再直接铺开 debug section 的路径、导出与帮助说明 UI 细节，只保留 owner 创建。

### path picker 与导出路径

debug owner 内继续保留原有路径选择语义：

- 优先使用当前平台的 `debugLogPaths`
- 若当前路径为空，则按 `allowedExportPaths`、桌面目录、用户主目录的顺序决定 picker 默认路径
- 生成 diagnostics 文件后，只有用户确认时才把新目录持久化为当前平台默认目录

### diagnostics action

owner 内的 action 保持既有行为：

- `copy` 仍调用 `buildDiagnosticReport('copy-diagnostics')` 并写入剪贴板
- `generate` 仍调用 `writeDiagnosticLogFile(targetDirectory, 'settings-export')`
- 打开 debug logging 时仍会触发 `logServerStatusSnapshot('settings-toggle')`

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 构建并挂载整个 debug section |
| `dispose()` | 为 settings tab 重建/关闭提供对称 owner 接口；当前无额外清理状态 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用 owner，把 debug section lifecycle 从主设置类中收口出去
- `core/types/settings.ts`: 提供 `getCurrentPlatformKey()` 与 `getCurrentPlatformDebugLogPath()`，用于平台相关 log path 解析
- `main.ts`: 提供 `saveSettings()`、`logServerStatusSnapshot()`、`buildDiagnosticReport()` 与 `writeDiagnosticLogFile()`
- `shared/logger.ts`: 记录 diagnostics copy / generate failure

## 注意事项

- 不要改变 platform path fallback、directory picker、diagnostic report/file generation 或 debug logging 触发语义。
- 如果后续继续推进 debug lane，优先在这个 owner 内扩展完整 debug section lifecycle，而不是回到 `OpenCodianSettings` 主类里追加 setting 闭包。
