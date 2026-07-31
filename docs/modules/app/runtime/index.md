# app/runtime index

app 层 runtime coordinator 文档入口。`PluginRuntimeCoordinator` 负责启动后的跨 view/model refresh、slash catalog invalidation、deferred warmup 与 plugin update startup check；其 timer、animation-frame 与 warmup promise 调度状态只在该 coordinator 内维护。

- [PluginRuntimeCoordinator](./PluginRuntimeCoordinator.md)

`OpenCodianStartupCoordinator` 与 `OpenCodianSettingsRuntimeCoordinator` 仍位于 `core/runtime`，分别负责启动引导/性能追踪与设置保存/主题运行时编排。
