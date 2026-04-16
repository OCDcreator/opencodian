# Model Config Barrel

> **源码**: `src/core/config/modelConfig.ts`
> **状态**: [REVIEW]

## 概述

`modelConfig.ts` 现在只保留 `core/config` 的模型配置辅助 barrel 职责。

`R145` 把原来单个大文件里的 5 类职责压回相邻 owner：

- `modelConfigShared.ts`：带注释 JSON 解析、模型子集提取/清洗/回写、引用字符串与深拷贝辅助
- `modelConfigCatalog.ts`：`ModelCatalog` 类型、runtime/local/server catalog 构建与 merge
- `modelConfigAvailability.ts`：provider enablement、inherited config layering、catalog 过滤与最小覆盖写回
- `modelConfigAssembly.ts`：`baseEffective` / `effective` 组装、server catalog assembly、probe plan 生成
- `modelConfigSelection.ts`：model selection 状态解析与可用模型回退

这样调用方仍然保留单一深路径导入入口，但 catalog merge、provider disable layering 与 `baseEffective` / `effective` projection 不再混在一个超长文件里。

## 公开导出

```typescript
export * from './modelConfigAssembly';
export * from './modelConfigAvailability';
export * from './modelConfigCatalog';
export * from './modelConfigSelection';
export * from './modelConfigShared';
```

## 调用约定

- `ModelConfigService`、settings model picker 与 chat model selection 继续从这个 barrel 取类型与 helper。
- 新增职责时优先放回对应 owner，而不是再把逻辑堆回 barrel。
- 只有需要稳定深路径导入的调用方才应继续引用 `src/core/config/modelConfig.ts`；owner 内部交互应直接走相邻模块。
