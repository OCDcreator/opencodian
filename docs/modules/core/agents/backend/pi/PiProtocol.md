# PiProtocol

> 源码: src/core/agents/backend/pi/PiProtocol.ts

## 职责

服务协议 TypeScript 边界：29官方RPC、23SDK补充命令、模型元数据和UI类型。只允许声明的业务操作，不允许任意反射。

## 验证

运行时握手核验协议1和52操作；SDK脚本对照安装版本的RpcCommand union；PiWorkbenchActions.test.ts校验管理入口完整。

2026-09-09：新增4个配置操作get/save_configuration、get/save_model_configuration，独立PiSettingField/PiConfigurationDocument类型。配置操作有专用页面，不算会话工作台动作。
