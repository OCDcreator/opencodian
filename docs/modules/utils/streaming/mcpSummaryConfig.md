# MCP Summary Config

> **源码**: `src/utils/streaming/mcpSummaryConfig.ts`
> **状态**: [REVIEW]

## 概述

`mcpSummaryConfig.ts` 为 MCP 工具调用生成简短摘要。它根据工具名中的动作词选择分类字段优先级，再从 top-level input fields 中提取最有代表性的值；没有分类命中时退回到通用字段和首个标量值。

## 导入关系

```text
上游: 无
下游: ToolCallRenderer.ts, utils/streaming/index.ts, docs/modules/utils/streaming/mcp-summary-fields.md
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `McpSummaryCategoryId` | 搜索、读取、执行、写入、认证等摘要类别 |
| `McpSummaryCategoryDefinition` | 类别的 label、动作词和字段优先级 |
| `MCP_SUMMARY_CATEGORY_DEFINITIONS` | 工具名语义分类配置 |
| `MCP_GENERIC_SUMMARY_FIELDS` | 分类未命中时的通用字段优先级 |
| `MCP_PATH_LIKE_FIELDS` / `MCP_URL_LIKE_FIELDS` / `MCP_ARGUMENT_FIELDS` | 字段格式化规则集合 |
| `getMcpToolSummary()` | 主入口：从工具名和 input 生成摘要文本 |

## 核心逻辑

### 工具名语义优先

`getMcpToolSummary()` 会将工具名按 `__`、`_`、`:`、`-` 分词，优先从末尾向前匹配动作词，再做全量 tokens 搜索。命中 category 后按该 category 的 fields 顺序取 input 值。

### 字段格式化

字段值只读取 top-level input：

- path-like 字段只显示末尾文件名或路径片段
- argument 字段只接受字符串
- 普通字符串会截断到 60 字符
- URL-like 字段保留截断后的 URL 文本

### 回退顺序

若 category fields 无摘要，则尝试 `MCP_GENERIC_SUMMARY_FIELDS`。仍无结果时，返回 input 中第一个可格式化标量值。

## 数据流

```text
ToolCallRenderer
  → getMcpToolSummary(toolName, input)
  → category / generic / scalar fallback
  → 工具调用卡片摘要
```

## 与其他模块的交互

- `ToolCallRenderer.ts` 调用 `getMcpToolSummary()` 渲染 MCP 工具摘要。
- `utils/streaming/index.ts` 暴露该模块的配置和 helper。
- 字段优先级说明见 `docs/modules/utils/streaming/mcp-summary-fields.md`。

## 配置项

无运行时配置；分类、动作词和字段优先级都在本模块常量中维护。

## 注意事项

- 保持 MCP 摘要只读 top-level input fields，避免深层 payload 扫描造成误匹配或隐私噪音。
- 新增类别时要同步 `mcp-summary-fields.md` 的说明。
- 不要把 custom tool 摘要逻辑混入这里；该模块只处理 MCP summary 规则。
