# 内置 Glass 适配器注册

> **源码**: `src/utils/glass/builtin-adapters.ts`
> **状态**: [DRAFT]

## 概述

提供 `registerBuiltinGlassAdapters()` 函数，负责将所有内置玻璃效果适配器注册到全局注册表。当前注册的适配器为 `shuding` 和 `nikdelvin`。`shudingDiamond` 适配器的 import 保留但未注册。

## 导入关系
上游: `./adapters/shuding` (adapter), `./adapters/nikdelvin` (adapter), `./registry` (registerGlassAdapter)
下游: `./index` (re-export), `main.ts` (调用)

## 核心类型 / 接口

无独立类型定义，使用 `GlassEffectAdapter` 接口。

## 核心逻辑

### 注册流程
`registerBuiltinGlassAdapters()` 依次调用：
1. `registerGlassAdapter(shudingAdapter)` — 注册 Shuding 适配器
2. `registerGlassAdapter(nikdelvinAdapter)` — 注册 Nikdelvin 适配器

`shudingDiamond` 已 import 但不参与注册。

## 关键方法

| 方法 | 说明 |
|------|------|
| `registerBuiltinGlassAdapters()` | 注册全部内置适配器到 registry |

## 数据流

```
main.ts → onload()
  → registerBuiltinGlassAdapters()
    → registerGlassAdapter(shudingAdapter)   // id: 'shuding'
    → registerGlassAdapter(nikdelvinAdapter)  // id: 'nikdelvin'
```

## 与其他模块的交互

- **main.ts**: 在 `onload()` 中调用此函数完成初始化
- **registry.ts**: 底层注册操作委托给 `registerGlassAdapter()`
- **adapters/shuding.ts**: 导出 `adapter` 常量
- **adapters/nikdelvin.ts**: 导出 `adapter` 常量

## 配置项

无

## 注意事项

- `shudingDiamond` 的 import 存在但被注释掉（未注册），适配器代码本身仍保留在仓库中
- 调用时机必须在任何 `getGlassAdapter()` 查询之前
- 此函数是幂等的——重复调用会覆盖相同 ID 的适配器

## 待补充
- [ ] `shudingDiamond` 适配器的启用/禁用策略文档
- [ ] 未来新增适配器的注册步骤
