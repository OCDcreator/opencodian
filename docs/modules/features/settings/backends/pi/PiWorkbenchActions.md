# PiWorkbenchActions

> 源码: src/features/settings/backends/pi/PiWorkbenchActions.ts

## 职责

52个类型化操作分为会话历史、运行队列、模型上下文、工具扩展、账户导出。每项定义可读标签、输入和持久化操作确认，不允许任意方法名输入。

## 验证

PiWorkbenchActions.test.ts对照协议全集，防止遗漏/重复。业务实现位于独立SDK服务。

2026-10-02：允许操作目录新增 get_available_thinking_levels 与 get_entries/since；set_thinking_level 字段不再提供静态档位，选项由工作台读取所选 session 决定。PiWorkbenchActions.test.ts 对照必需和 optional 协议全集；操作保持 allowlist。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/backends/pi/PiWorkbenchActions.ts`。
- 原位置：`src/features/settings/PiWorkbenchActions.ts`；文件名、导出接口与业务职责保持不变。

## Goal 与会话工作台（2026-10-30）

工作台允许读取/控制已加载的兼容 Goal 扩展，并保留 SDK 操作白名单；未加载扩展返回明确不可用。
