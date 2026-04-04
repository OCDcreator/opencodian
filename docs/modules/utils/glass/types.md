# Glass 效果系统类型定义

> **源码**: `src/utils/glass/types.ts`
> **状态**: [DRAFT]

## 概述

定义 Liquid Glass 效果系统的全部核心类型，包括挂载上下文、参数定义、设置值类型和适配器接口。所有适配器实现和消费者都依赖此模块。

## 导入关系
上游: 无（纯类型模块）
下游: `./registry`, `./builtin-adapters`, `./adapters/*`, `./index` (re-export), `OpenCodianView`, `OpenCodianSettings`

## 核心类型 / 接口

### GlassMountContext

适配器挂载时接收的上下文对象，包含四个必需属性和一个可选属性：

| 属性 | 类型 | 说明 |
|------|------|------|
| `shellEl` | `HTMLElement` | 外壳 DOM 元素（面板容器） |
| `contentEl` | `HTMLElement` | 内容区域 DOM 元素 |
| `svgRootEl` | `SVGSVGElement` | SVG 根元素，用于滤镜定义 |
| `filterLayerEl` | `HTMLElement` | 滤镜层 DOM 元素 |
| `resolveAssetUrl?` | `(path: string) => string \| null` | 解析资源 URL 的回调 |

### GlassParamDef

适配器参数定义，描述设置 UI 中的一个参数：

| 属性 | 类型 | 说明 |
|------|------|------|
| `key` | `string` | 参数键名 |
| `labelKey` | `string` | i18n 翻译键（标签） |
| `descKey?` | `string` | i18n 翻译键（描述） |
| `type` | `'number' \| 'select' \| 'text' \| 'toggle'` | 参数类型 |
| `sectionLabelKey?` | `string` | i18n 翻译键（分组标题） |
| `min/max/step?` | `number` | 数值参数范围 |
| `unit?` | `string` | 参数单位 |
| `options?` | `{ value: string; label?: string; labelKey?: string }[]` | select 类型的选项列表 |
| `defaultValue` | `number \| string \| boolean` | 默认值 |

### GlassAdapterSettingsValue

```typescript
type GlassAdapterSettingsValue = number | string | boolean;
```

### GlassEffectAdapter

适配器接口，每个适配器必须实现：

| 属性/方法 | 类型 | 说明 |
|-----------|------|------|
| `id` | `'shuding' \| 'nikdelvin' \| 'shudingDiamond'` | 唯一标识 |
| `displayName` | `string` | 显示名称 |
| `description` | `string` | 适配器描述 |
| `paramDefs` | `readonly GlassParamDef[]` | 参数定义列表 |
| `mount(ctx, settings)` | `void` | 挂载效果到 DOM |
| `unmount(ctx)` | `void` | 卸载效果并清理 DOM |
| `updateSettings?(ctx, settings)` | `void` | 运行时更新参数 |

## 核心逻辑

### 适配器生命周期

1. **mount**: 接收 `GlassMountContext` 和 `settings`，创建 DOM 层、SVG 滤镜、事件监听等
2. **updateSettings**: 可选，在设置变更时高效更新效果而不重建全部 DOM
3. **unmount**: 清理所有 DOM 变更、事件监听和 ResizeObserver，恢复原始状态

### 参数定义与 UI 映射

`paramDefs` 数组中的每个 `GlassParamDef` 直接映射到设置面板的一个 UI 控件。`sectionLabelKey` 用于参数分组，`type` 决定控件类型。

## 关键方法

| 方法 | 说明 |
|------|------|
| `mount(ctx, settings)` | 首次挂载或重新挂载效果 |
| `unmount(ctx)` | 完全清理效果 |
| `updateSettings(ctx, settings)` | 增量更新参数（可选） |

## 数据流

```
OpenCodianSettings (UI 控件)
  → settings.liquidGlassAdapterSettings
    → adapter.mount(ctx, settings) 或 adapter.updateSettings(ctx, settings)
```

## 与其他模块的交互

- **所有适配器实现** (`adapters/shuding.ts`, `adapters/nikdelvin.ts`, `adapters/shudingDiamond.ts`): 实现此接口
- **registry.ts**: 使用 `GlassEffectAdapter['id']` 作为 Map 键
- **OpenCodianSettings**: 根据 `paramDefs` 动态构建设置 UI

## 配置项

无

## 注意事项

- `id` 字段是联合类型，新增适配器需扩展此类型
- `updateSettings` 是可选方法——不实现时消费者应 fallback 到 `unmount` + `mount`
- `resolveAssetUrl` 用于 nikdelvin 适配器解析内置背景图片资源路径

## 待补充
- [ ] 新增适配器 ID 的扩展指南
- [ ] `resolveAssetUrl` 的具体调用链
