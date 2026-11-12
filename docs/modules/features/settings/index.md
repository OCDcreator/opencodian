# Settings Feature Barrel

> **源码**: `src/features/settings/index.ts`
> **状态**: [REVIEW]

## 概述

设置功能层的最小 barrel 入口，当前只暴露 `OpenCodianSettingTab`。虽然设置目录下还有多个 modal 辅助模块，但这个 barrel 只把“主设置页入口”公开给上层。

## 导入关系

```text
上游: ./OpenCodianSettings
下游: main.ts
```

## 核心类型 / 接口

```typescript
export { OpenCodianSettingTab } from './OpenCodianSettings';
```

## 核心逻辑

### 设置主入口收口

该文件把设置子系统的公开 API 控制在一个类上：`OpenCodianSettingTab`。其他弹窗仍由设置页内部按需直接导入。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `OpenCodianSettingTab` | 插件设置页主入口 |

## 数据流

典型链路：`main.ts` 注册设置页 -> 从本 barrel 导入 `OpenCodianSettingTab` -> 设置页内部再拉起各类 modal。

## 与其他模块的交互

- 主实现见 [OpenCodianSettings.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/OpenCodianSettings.md)
- 其他设置弹窗如 [ModelPickerModal.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/models/ModelPickerModal.md)、[ModelConfigModal.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/models/ModelConfigModal.md)、[OpencodeConfigModal.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/backends/opencode/OpencodeConfigModal.md) 由设置页直接调用

## 配置项

无直接配置。

## 注意事项

- 若后续需要从设置目录公开更多组件，应先确认是否应该继续保持“单主入口”设计

## Shared backend settings controls

- [BackendSettingsControls](controls/BackendSettingsControls.md): native choice cards and sliders with accessible labels, scope/effect metadata and failed-save rollback.
- [BackendSettingsWorkspace](controls/BackendSettingsWorkspace.md): the shared source/application strip and allowlisted working-default recovery point for the six backend workspaces.
- [settingsLayoutRegistry](settingsLayoutRegistry.md): current backend task groups and persisted legacy-route migration.

## DSH 配置工作区

- [SettingsDshSection](backends/dsh/SettingsDshSection.md)：保留横向任务标签与连接备份作用域，装配各配置领域。
- [SettingsDshNativeWorkspace](backends/dsh/SettingsDshNativeWorkspace.md)：当前库稀疏覆盖、分组事务、配置修订、恢复和真实有效值回读。
- [SettingsDshNativeFields](backends/dsh/SettingsDshNativeFields.md)：声明式字段的继承与结构化条目表单。
- [SettingsDshNativeHistory](backends/dsh/SettingsDshNativeHistory.md)：非敏感快照验证、恢复差异预览、取消和最终写入 CAS。
- [SettingsDshExtensionsWorkspace](backends/dsh/SettingsDshExtensionsWorkspace.md)：本机隔离 profile 的扩展操作与进度。
- [SettingsDshExtensionSettings](backends/dsh/SettingsDshExtensionSettings.md)：真实已加载扩展 schema 的受限编辑与 CAS。
- [SettingsDshMcpWorkspace](backends/dsh/SettingsDshMcpWorkspace.md)：MCP 声明草稿、验证与持久恢复。
- [SettingsDshMcpServerControls](backends/dsh/SettingsDshMcpServerControls.md)：复用的掩码名值行、高级参数和证据状态控件。

## 补充说明

- `OpenCodianSettingTab` 的唯一消费方是 `main.ts` 中的 `this.addSettingTab(new OpenCodianSettingTab(...))` 调用，无其他外部消费方

- [PiWorkbenchActions](backends/pi/PiWorkbenchActions.md)：Pi完整业务操作目录。
- [PiWorkbenchModal](backends/pi/PiWorkbenchModal.md)：Pi分组管理工作台。

- [SettingsPiConfigurationSection](backends/pi/SettingsPiConfigurationSection.md)：51项原生设置。
- [SettingsPiProvidersSection](backends/pi/SettingsPiProvidersSection.md)：完整自定义provider/models配置。

## Claude 设置模块

- [SettingsClaudeProvidersSection](backends/claude/SettingsClaudeProvidersSection.md)：服务与模型页，当前配置回读、preset 行列表与 CAS 应用/迁移。
- [SettingsClaudeProviderModals](backends/claude/SettingsClaudeProviderModals.md)：preset 凭据编辑（仅保存/保存并应用）与脱敏配置检查 modal。
- [SettingsClaudeProviderMetadataPersistenceCoordinator](backends/claude/SettingsClaudeProviderMetadataPersistenceCoordinator.md)：source 写入后的 plugin metadata 持久化与重试恢复。
