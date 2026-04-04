# Model Types

> **源码**: `src/core/types/models.ts`
> **状态**: [DRAFT]

## 概述

定义 AI 模型和模型提供商的类型结构，以及默认上下文窗口大小的查找函数。提供模型能力标记（thinking、vision）和上下文窗口估算，用于 UI 展示和 token 用量计算。

## 导入关系

上游: 无外部依赖
下游:
- `src/core/config/ModelConfigService.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`（模型选择下拉框）
- `src/features/settings/ModelConfigModal.ts`

## 核心类型 / 接口

| 类型 | 说明 |
|------|------|
| `ModelInfo` | 模型信息（id, name, provider, contextWindow, supportsThinking?, supportsVision?） |
| `ModelProvider` | 模型提供商（id, name, models[], defaultModelId?） |

## 核心逻辑

### 上下文窗口解析
`getDefaultContextWindow(modelId)` 按以下优先级查找：
1. 精确匹配 `DEFAULT_CONTEXT_WINDOWS` 映射表
2. 部分匹配（`includes` 检查），覆盖 claude-3 系列（200k）、gpt-4 系列（128k）、gpt-3.5（16k）
3. 默认回退值 128000

### 已知模型上下文窗口

| 模型模式 | 上下文窗口 |
|----------|-----------|
| claude-3-opus | 200,000 |
| claude-3.5-sonnet | 200,000 |
| claude-3.5-haiku | 200,000 |
| claude-3（其他） | 200,000 |
| gpt-4 / gpt-4-turbo / gpt-4o | 128,000 |
| gpt-3.5 | 16,000 |
| 未知模型 | 128,000 |

## 关键方法

| 方法 | 说明 |
|------|------|
| `getDefaultContextWindow(modelId)` | 根据模型 ID 返回默认上下文窗口大小 |

## 数据流

1. OpenCode server 返回 provider/model 列表 → 解析为 `ModelProvider[]`
2. 每个 `ModelInfo.contextWindow` 使用 `getDefaultContextWindow()` 填充
3. UI 使用 `contextWindow` 计算并展示 token 用量百分比

## 与其他模块的交互

- **ModelConfigService**: 使用 `ModelProvider` 和 `ModelInfo` 构建本地/服务端模型目录
- **OpenCodianView**: 模型选择下拉框、上下文用量环形图
- **TabContextState**: 使用 `contextWindow` 计算 token 百分比

## 配置项

无直接配置。`DEFAULT_CONTEXT_WINDOWS` 为硬编码映射表。

## 注意事项

- 部分匹配使用 `includes()`，可能误匹配（如 `gpt-4o-mini` 会命中 `gpt-4` 分支，得到 128000 而非实际值）
- 服务端返回的模型信息中如果包含 `contextWindow` 字段，应优先使用而非此函数的估算值
- `supportsThinking` 和 `supportsVision` 为可选字段，缺失时 UI 应做降级处理

## 待补充
- [ ] 补充更多模型的上下文窗口映射
- [ ] 记录服务端 contextWindow 与本地估算的优先级策略
- [ ] 补充 supportsThinking / supportsVision 的判断来源
