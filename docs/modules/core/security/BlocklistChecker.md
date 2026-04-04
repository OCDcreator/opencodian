# BlocklistChecker

> **源码**: `src/core/security/BlocklistChecker.ts`
> **状态**: [DRAFT]

## 概述

提供命令黑名单检查能力。将 bash 命令与用户配置的黑名单模式列表进行匹配，模式支持大小写不敏感的正则表达式，当正则无效或模式超过 500 字符时回退到子字符串匹配。用于在权限审批流程中拦截危险命令。

## 导入关系

上游: `src/core/types/settings.ts`（`PlatformBlockedCommands`、`enableBlocklist` 设置）
下游: `OpenCodianView`（权限卡片处理）、`OpenCodeService`（工具调用前检查）

## 核心类型 / 接口

无独立类型导出，使用原始 `string[]` 作为模式列表。

## 核心逻辑

### 命令匹配算法
1. 若 `enableBlocklist` 为 `false`，直接返回 `false`（不拦截）
2. 遍历所有 pattern：
   - 模式长度 > 500 → 强制使用子字符串匹配（安全降级）
   - 尝试构造 `RegExp(pattern, 'i')` 进行正则匹配
   - 正则构造失败 → 回退到 `toLowerCase().includes()` 子字符串匹配

### 常量
- `MAX_PATTERN_LENGTH = 500` — 超过此长度的模式跳过正则编译

## 关键方法

| 方法 | 说明 |
|------|------|
| `isCommandBlocked(command, patterns, enableBlocklist)` | 检查命令是否被任何黑名单模式匹配 |

## 数据流

1. OpenCode server 发送 `permission_request` 事件（含 bash 命令）
2. 插件 UI 展示权限卡片
3. `isCommandBlocked()` 检查命令是否命中黑名单
4. 若命中 → 自动拒绝或标记为危险；若未命中 → 展示给用户审批

## 与其他模块的交互

- **Settings**: 读取 `settings.enableBlocklist` 和 `settings.blockedCommands`
- **OpenCodianView**: 在渲染权限卡片时调用检查
- **Permission types**: 配合 `PermissionMode`（`yolo`/`normal`/`plan`）决定是否自动拦截

## 配置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `enableBlocklist` | `true` | 是否启用黑名单检查 |
| `blockedCommands.unix` | `['rm -rf', 'chmod 777', ...]` | Unix 平台黑名单 |
| `blockedCommands.windows` | `['del /s /q', 'rd /s /q', 'Remove-Item -Recurse -Force', ...]` | Windows 平台黑名单 |

## 注意事项

- Windows 上 Bash 工具运行在 Git Bash/MSYS2 中但可调用 Windows 命令，因此 `getBashToolBlockedCommands()` 在 Windows 上合并两套黑名单
- 黑名单检查不区分大小写
- 正则失败时静默降级为子字符串匹配，不抛异常

## 待补充
- [ ] 记录黑名单匹配在 YOLO 模式下的行为（是否自动拒绝）
- [ ] 补充典型黑名单模式的配置示例
