# sdkErrorClassification

> **源码**: `src/core/opencode/sdkErrorClassification.ts`
> **状态**: [DRAFT]

## 概述

SDK 错误分类工具。根据 SDK 1.15.3 error interceptor 包装后的错误结构，将错误分为 7 种类型：`not_found`、`forbidden`、`bad_request`、`provider_auth`、`rate_limit`、`server_error`、`unknown`。

## 核心逻辑

- `classifySdkError(error)` 检查 `error.cause.body.name`（SDK 结构化错误名）优先于 `error.cause.status`（HTTP 状态码）进行分类；非 Error 实例路径与 Error 实例路径使用一致的 name-first 优先级；两条路径均识别 `SessionNextRetryError`
- `extractSdkErrorCause(error)` 从 `Error.cause` 中提取 SDK 包装的结构化错误信息（status + body）
- `SdkErrorClass` 类型导出供 StreamChunk、ErrorChunk 等使用

## 与其他模块的交互

- `OpenCodeSdkFacade.extractSdkErrorMessage()` 使用 `extractSdkErrorCause` 提取 cause.body 中的精确错误消息
- `OpenCodeStreamEventTransformer.handleSessionError()` 使用 `classifySdkError` 对 SSE 错误事件分类，附加到 error chunk 的 `errorClass` 字段
- `OpenCodeStreamingRuntimeCoordinator.buildErrorChunk()` 对运行时错误附加分类
- `StreamController.handleErrorChunk()` 根据 `errorClass` 显示不同的错误图标
- 独立于 SDK 导入链，避免在测试和流式处理模块中引入 SDK 模块解析依赖
