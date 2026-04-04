# Glass 适配器注册表

> **源码**: `src/utils/glass/registry.ts`
> **状态**: [DRAFT]

## 概述

Glass 效果适配器的全局注册表。使用 `Map<GlassEffectAdapter['id'], GlassEffectAdapter>` 存储已注册适配器，提供注册、查询、列举和注销四种操作。注册表是模块级单例，在插件生命周期内持续存在。

## 导入关系
上游: `./types` (`GlassEffectAdapter`)
下游: `./builtin-adapters` (注册), `./index` (re-export), `OpenCodianView` (查询), `OpenCodianSettings` (列举)

## 核心类型 / 接口

适配器 ID 类型为 `GlassEffectAdapter['id']`，即 `'shuding' | 'nikdelvin' | 'shudingDiamond'` 联合类型。

## 核心逻辑

### 注册表数据结构
模块级 `Map` 实例 `glassAdapterRegistry`，键为适配器 ID，值为完整适配器对象。

### 注册与查询
- `registerGlassAdapter` 将适配器按 `adapter.id` 存入 Map
- `getGlassAdapter` 按 ID 返回适配器或 `undefined`
- `getAllGlassAdapters` 返回所有值的数组
- `unregisterGlassAdapter` 按 ID 删除

## 关键方法

| 方法 | 说明 |
|------|------|
| `registerGlassAdapter(adapter)` | 注册适配器，相同 ID 会覆盖 |
| `getGlassAdapter(id)` | 按 ID 查找适配器 |
| `getAllGlassAdapters()` | 获取全部已注册适配器列表 |
| `unregisterGlassAdapter(id)` | 注销指定 ID 的适配器 |

## 数据流

```
registerGlassAdapter(shudingAdapter)
  → glassAdapterRegistry.set('shuding', adapter)

getGlassAdapter('shuding')
  → glassAdapterRegistry.get('shuding')
```

## 与其他模块的交互

- **builtin-adapters.ts**: 在 `registerBuiltinGlassAdapters()` 中调用 `registerGlassAdapter()` 注册内置适配器
- **OpenCodianView**: 调用 `getGlassAdapter(currentAdapterId)` 获取活跃适配器
- **OpenCodianSettings**: 调用 `getAllGlassAdapters()` 构建设置 UI 的适配器选择器

## 配置项

无

## 注意事项

- 重复注册同一 ID 会静默覆盖之前的适配器
- 注册表是模块级状态，不随 Obsidian 工作区重置
- 返回的适配器对象是引用，外部不应修改

## 待补充
- [ ] 第三方适配器注册的扩展点文档
- [ ] 适配器热插拔场景下的状态清理
