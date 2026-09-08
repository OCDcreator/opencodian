# PiWorkbenchActions

> 源码: src/features/settings/PiWorkbenchActions.ts

## 职责

52个类型化操作分为会话历史、运行队列、模型上下文、工具扩展、账户导出。每项定义可读标签、输入和持久化操作确认，不允许任意方法名输入。

## 验证

PiWorkbenchActions.test.ts对照协议全集，防止遗漏/重复。业务实现位于独立SDK服务。
