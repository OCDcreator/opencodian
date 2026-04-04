# Liquid Glass 效果系统

> **源码**: `src/utils/glass/index.ts`
> **状态**: [REVIEW]

## 概述

Liquid Glass 效果系统的入口模块。通过 barrel export 导出 `builtin-adapters`、`registry` 和 `types` 三个子模块的全部公共 API。该系统为聊天输入面板提供可插拔的视觉玻璃效果适配器，支持运行时注册、切换和参数调整。

## 导入关系
上游: `./builtin-adapters`, `./registry`, `./types`
下游: `main.ts`（插件入口调用 `registerBuiltinGlassAdapters()`）, `OpenCodianView.ts`（通过 registry 获取活跃适配器）

## 核心类型 / 接口

通过 re-export 暴露以下类型（定义于 `types.ts`）：

- `GlassEffectAdapter` — 适配器接口
- `GlassMountContext` — 挂载上下文
- `GlassParamDef` — 参数定义
- `GlassAdapterSettingsValue` — 设置值类型 (`number | string | boolean`)

## 核心逻辑

### Barrel 导出
模块仅包含三行 re-export 语句，将 `builtin-adapters`（注册函数）、`registry`（CRUD 函数）和 `types`（类型定义）统一暴露给外部消费者。

## 关键方法

| 方法 | 说明 |
|------|------|
| `registerBuiltinGlassAdapters()` | 来自 `builtin-adapters`，注册所有内置适配器 |
| `registerGlassAdapter(adapter)` | 来自 `registry`，注册一个适配器实例 |
| `getGlassAdapter(id)` | 来自 `registry`，按 ID 获取适配器 |
| `getAllGlassAdapters()` | 来自 `registry`，获取全部已注册适配器 |
| `unregisterGlassAdapter(id)` | 来自 `registry`，注销指定适配器 |

## 数据流

```
main.ts (onload)
  └─ registerBuiltinGlassAdapters()
       ├─ registerGlassAdapter(shudingAdapter)
       └─ registerGlassAdapter(nikdelvinAdapter)

OpenCodianView (渲染时)
  └─ getGlassAdapter(settings.liquidGlassAdapter)
       └─ adapter.mount(ctx, settings) / adapter.updateSettings(ctx, settings)
```

## 与其他模块的交互

- **main.ts**: 在 `onload()` 阶段调用 `registerBuiltinGlassAdapters()` 完成注册
- **OpenCodianView**: 通过 `getGlassAdapter()` 获取当前设置的适配器并调用 `mount`/`unmount`/`updateSettings`
- **OpenCodianSettings**: 设置面板提供适配器选择器和参数 UI

## 配置项

无直接配置项。适配器选择通过 `OpenCodianSettings.liquidGlassAdapter` 控制，各适配器参数通过 `OpenCodianSettings.liquidGlassAdapterSettings` 传递。

## 注意事项

- 当前已注册的适配器 ID 为 `'shuding'` 和 `'nikdelvin'`。`shudingDiamond` 代码保留但未注册
- 外部消费者应通过 registry 函数访问适配器，不直接 import 适配器模块
