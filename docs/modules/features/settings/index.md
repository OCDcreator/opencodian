# Settings Feature Barrel

> **源码**: `src/features/settings/index.ts`
> **状态**: [DRAFT]

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
- 其他设置弹窗如 [ModelConfigModal.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/ModelConfigModal.md)、[OpencodeConfigModal.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/OpencodeConfigModal.md) 由设置页直接调用

## 配置项

无直接配置。

## 注意事项

- 若后续需要从设置目录公开更多组件，应先确认是否应该继续保持“单主入口”设计

## 待补充

- [ ] 记录设置页之外是否存在其他 `OpenCodianSettingTab` 消费方

