# SettingsRemoteControlSection

> **源码**: `src/features/settings/SettingsRemoteControlSection.ts`
> **状态**: [REVIEW]

## 概述

R-C6 远程驱动的设置面（`feature.settings-plugin` owner 的 settings 分区文件，跟随 `SettingsImageGenerationSection` 的既有 per-feature 分区模式）。经典布局挂在"安全"分区之后（`OpenCodianSettings.addRemoteControlSettings`），分栏布局是 Security 主 tab 下的新二级 tab `remote`（`settingsLayoutRegistry.ts` + `SettingsTabbedRenderer.renderSecurityContent` 分派）。

## 导入关系

```text
上游: obsidian、core/types（normalizeRemoteControlBindAddress）、core/remotecontrol（纯函数 + 运行时状态类型）、i18n
下游: OpenCodianSettings.ts、SettingsTabbedRenderer.ts
```

对插件面采用结构化 host 接口（`settings` / `saveSettings` / `remoteControlService`），不 import 插件类，避免 feature → app 边。

## 行为

| 行 | 语义 |
|---|---|
| 主开关 | 开启时若无令牌则生成并弹**一次性展示模态**（复制按钮 + "不再显示"警告）；关闭只停监听不清令牌（关闭 ≠ 吊销），变更后 `saveSettings()` + `remoteControlService.applySettings()` |
| 接口状态 | 生命周期文本（关闭/监听中/失败原因，含 fail-closed 的 `missing-token` / `non-loopback-unacknowledged`），带重查按钮 |
| 绑定地址 | `localhost→127.0.0.1` 归一化；改回环回**清除**确认时间戳；改为非环回弹模态二次确认（明文 HTTP 无 TLS / 同网段可嗅探 Bearer 令牌 / 拿到令牌即可驱动 agent 改写 vault / 审计无身份模型，双语固定文案），取消则回滚输入框 |
| 访问令牌 | 只显示指纹（sha256 前 12 hex）；"重新生成"先确认（旧令牌即刻失效）再生成并弹一次性展示模态 |
| 审计日志 | 展示审计目录与 `droppedEvents`，"打开审计目录"经 `@electron/remote` 的 `shell.openPath`（缺失/失败显式提示路径） |

## 注意事项

- 令牌全文只在生成后的一次性模态中出现，任何其他 UI 面（状态行/日志/审计）只见指纹；复制走 `navigator.clipboard`。
- 服务端在绑定时会二次校验 `remoteControlNonLoopbackAcknowledgedAt`：UI 确认是便利性闸门，不是唯一防线。
- 模态均继承 Obsidian `Modal` 的焦点/reduced-motion 行为，无自定义动画；无新增 CSS（复用既有设置样式）。
