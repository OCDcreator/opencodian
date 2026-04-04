# Model Config Helpers

> **源码**: `src/core/config/modelConfig.ts`
> **状态**: [DRAFT]

## 概述

模型配置辅助模块，提供模型配置相关的工具类型和解析函数。作为 `ModelConfigService` 的底层工具集，处理模型标识符的解析、格式化、目录条目的构建等通用逻辑。

## 导入关系

```text
上游: src/core/types/models (模型类型定义)
下游: src/core/config/ModelConfigService
```

## 核心类型 / 接口

```typescript
// 模型标识符（格式: "provider/model"）
type ModelIdentifier = string;

// 从配置中解析出的模型信息
interface ParsedModelInfo {
  provider: string;
  model: string;
  // ...
}

// 模型目录构建辅助类型
// 具体类型待补充
```

## 核心逻辑

### 模型标识符解析

解析 `"provider/model"` 格式的模型标识符字符串，提取 provider 和 model 名称。处理边界情况如缺失 provider 前缀。

### 目录条目构建

将原始配置数据转换为标准化的模型目录条目格式，供 `ModelConfigService.getCatalogs()` 使用。

## 关键方法

| 方法 | 说明 |
|------|------|
| 待补充 | 解析模型标识符 |
| 待补充 | 构建目录条目 |
| 待补充 | 格式化模型标识符 |

## 数据流

作为无状态的辅助函数集，不维护独立的数据流。被 `ModelConfigService` 在目录构建过程中调用。

## 与其他模块的交互

- **ModelConfigService**: 唯一的直接消费者，在读取和构建目录时调用此模块的辅助函数
- **types/models**: 引用模型相关的类型定义

## 配置项

无独立配置项。

## 注意事项

- 应保持为纯函数/无状态工具集，不引入副作用
- 模型标识符格式 `"provider/model"` 在整个插件中应保持一致

## 待补充

- [ ] 完整的导出函数/类型列表
- [ ] 模型标识符解析的边界情况处理
- [ ] 与服务器返回的模型数据格式的映射关系
