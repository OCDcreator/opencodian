# Formatter Config Helpers

> **源码**: `src/core/config/formatterConfig.ts`
> **状态**: [REVIEW]

## 概述

`formatterConfig.ts` 封装 `.opencode/opencode.json` 中 `formatter` 子树的读取与精确写回规则。它把 formatter 专属的三态解析和 exact-write 语义从 `OpencodeConfigManager` 中抽出来，避免 manager 继续因为配置细节膨胀。

## 导入关系

```text
上游: src/core/types, src/core/config/modelConfig.ts
下游: src/core/config/OpencodeConfigManager.ts, 相关单元测试
```

## 核心导出

| 导出 | 说明 |
|------|------|
| `readFormatterConfigValue()` | 读取完整 config 中的 `formatter`，返回 `undefined` / `boolean` / 深拷贝对象 |
| `writeFormatterConfigValue()` | 以 exact-write 语义写回 `formatter`，支持字段删除 |

## 核心逻辑

### 三态读取

`readFormatterConfigValue()` 支持：

- 字段缺失：返回 `undefined`
- 布尔值：原样返回
- 对象：返回深拷贝副本

非布尔且非对象的异常值会被当作无效 formatter 值处理，不向上游泄露原始脏数据。

### 精确子树写回

`writeFormatterConfigValue()` 不做 deep merge，而是直接决定 `config.formatter` 的最终值：

- `null` / `undefined`：删除 `formatter`
- 布尔值：直接写布尔值
- 对象：写入深拷贝对象
- 异常值：回退为删除字段

这保证 formatter entry 被移除时，不会因为 merge 语义把旧 entry 留在磁盘上。

## 与其他模块的交互

- `OpencodeConfigManager.ts` 通过该模块实现 `getFormatterConfig()` / `updateFormatterConfig()`。
- formatter 相关单元测试通过 `OpencodeConfigManager` 间接覆盖这里的 exact-write 规则。

## 注意事项

- 该模块只负责 `formatter` 子树，不处理其余 OpenCode 配置。
- 深拷贝仍沿用 JSON round-trip，与现有 config helper 的 clone 行为保持一致。
