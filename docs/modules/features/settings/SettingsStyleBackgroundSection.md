# SettingsStyleBackgroundSection

> **源码**: `src/features/settings/SettingsStyleBackgroundSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsStyleBackgroundSection.ts` 是设置页 Style 分区里“聊天背景图”子区块的专属 owner。它从 `OpenCodianSettings` 主类中接管了这块 subsection 的完整生命周期，包括：

- 背景卡片与上传 / 替换 / 移除按钮装配
- fit mode 与九个背景数值控件的渲染
- 背景预览图的异步加载与 request-id 防抖
- 预览拖拽时的 focusX / focusY 写回
- 背景分组 reset 后的刷新与提示

目标不是抽出薄 helper，而是把一个完整、可独立演进的 settings subsection lifecycle 收口到单独 owner，避免 `OpenCodianSettings` 继续直接持有大段 background DOM/state 组装。

## 核心逻辑

### 挂载与刷新

- `attach()` 在传入的 style 容器里创建独立 host，并立刻触发首次 `refresh()`
- `refresh()` 每次都会先清掉旧的 `background` style binding，再整体重建 subsection DOM
- `dispose()` 递增 preview request id 并丢弃 host，避免异步预览回填到旧 DOM

### 背景预览

- 卡片顶部保持“空态 / 加载中 / 丢失资源”三种展示
- 当已有背景图时，会调用 `plugin.resolveChatThemeBackgroundDataUrl()` 异步读取 data URL
- 预览应用 `fitMode`、opacity、blur、depth、dim、saturation、brightness、focusX / focusY 等样式
- 拖拽预览时直接写回 `chatAppearance.background.focusX/focusY`，并复用设置页的 style apply/save 节流链路

### 设置写回

- fit mode dropdown 直接更新 `appearance.background.fitMode`，然后触发 style apply/save，并重渲染 subsection
- 数值控件仍复用 `OpenCodianSettings` 现有的 `addNumericStyleControl()` 与统一 binding 同步机制
- reset 动作走 `plugin.resetChatAppearanceGroupAndSave('background')`，随后同步控件值、刷新 subsection 并给出 Notice

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 在 style 分区中挂载 background subsection host |
| `refresh()` | 清理旧 binding 后整体重建 background subsection |
| `dispose()` | 终止旧 preview 回填并释放 host 引用 |
| `reset()` | 通过 plugin reset background group，并刷新控件与预览 |

## 与其他模块的交互

- `OpenCodianSettings`: 负责创建该 owner，并提供 style-group scaffolding、数值控件 host seam、binding 清理与统一 apply/save 回调
- `OpenCodianPlugin`: 提供背景资源导入/清理、baseline reset、主题背景 data URL 解析与 chat appearance 写回
- `core/types/settings.ts`: 定义 background 设置结构、默认值与归一化边界
- `src/features/chat/chatAppearance.ts`: 提供 `fitMode -> background-size` 映射

## 注意事项

- `background` 组控件的 binding 必须在每次重渲染前先清理，否则 theme preset / reset 后会残留失效的 sync handler
- preview 的异步回填必须继续保留 request-id + `isConnected` 双重保护，避免设置页重建后回写到旧节点
- 如果只是调整聊天背景子区块，优先改这里；不要再把 upload / preview / drag / reset 逻辑塞回 `OpenCodianSettings`
