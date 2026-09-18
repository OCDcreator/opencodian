# ImageGenerationService

> **源码**: `src/core/agents/imagegen/ImageGenerationService.ts`
> **状态**: [REVIEW]

## 概述

`ImageGenerationService` 是 R-C2 文生图的模型调用服务（`core.agents` owner）：插件侧直接发起 OpenAI images 兼容的 `POST {baseURL}/images/generations` 请求，**不经过任何 agent 后端会话**（§11.3），也不复用聊天侧 vision 输入的图片序列化（§11.4，方向相反）。

类本身 transport 注入、不依赖 Obsidian 运行时；`createRequestUrlImageGenTransport()` 提供基于 Obsidian `requestUrl` 的生产 transport（选型理由同 `sdkFetch.ts`：绕过 CORS、桌面/移动通用）。`requestUrl` 无超时/中止参数，服务的 deadline race（`IMAGE_GENERATION_TIMEOUT_MS = 120_000`）是真正的超时执行者；AbortSignal 触发时 promise 以 `network` + "aborted" 失败，已在途的 HTTP 请求无法真正取消（如实受限）。

## 对外 API

```typescript
const IMAGE_GENERATION_TIMEOUT_MS = 120_000;
const IMAGE_GENERATION_MAX_ASSET_BYTES = 25 * 1024 * 1024;

interface ImageGenTransport {
  postJson(url, headers, body: unknown, timeoutMs: number): Promise<{ status: number; body: ArrayBuffer }>;
}

type ImageGenerationResult =
  | { ok: true; bytes: ArrayBuffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }
  | { ok: false; error: string; kind: 'timeout' | 'quota' | 'http' | 'network' | 'size-limit' };

class ImageGenerationService {
  generate(config, prompt, signal?, timeoutMs?): Promise<ImageGenerationResult>;
}

// 纯函数（两入口共用）
buildImageGenerationRequest(config, prompt): { url; headers; body };
decodeImageGenerationResponse(status, body): ImageGenerationResult;
sniffImageMimeType(bytes): ImageGenerationMimeType | null;
buildImageEmbedText(path, width, form: 'line' | 'inline'): string;
imageEmbedWidthSuffix(width): string;
```

## Fail-closed 契约（设计 §3.2/§4.7）

- 非 2xx 一律失败：401/402/429 → `quota`，其余 → `http`（携带供应商 error.message 摘要）。
- 响应只接受 `data[0].b64_json`；URL-only 响应是显式失败，**不**跟随下载（不做"猜测 b64/URL"）。
- 字节按签名嗅探（PNG/JPEG/WEBP），未知格式 → `http` 失败；`response_format` 参数**不**发送（gpt-image-1 拒绝它）。
- 字节数超 `IMAGE_GENERATION_MAX_ASSET_BYTES` → `size-limit`，不截断不压缩。
- **无任何自动重试**；重试是用户再次点击。

## 嵌入文本（两入口共用）

`buildImageEmbedText` 产出 `![[路径|宽度]]`：`inline` 形态即嵌入本身；`line` 形态带前后空行（独占一行的块级语义）。宽度 ≤0 时省略 `|width` 后缀。`line` 形态的空行填充是**特性行为**，消费方不得再过 `normalizeInsertionText`（会剥掉边缘空行）——由 `pendingImageAssetPath`/`preserveWhitespace` 标记（见 `InlineEditAccept`）。

## 关联模块

- `src/core/storage/ImageAssetStorage.ts`：成功结果交给它落盘（W-asset）。
- `src/features/inline-edit/InlineEditImageGen.ts`：行内入口编排。
- `src/features/chat/services/ImageGenerationChatController.ts`：聊天入口编排。
- `src/main.ts`：组合根，构造服务并注入 `createRequestUrlImageGenTransport()`。
