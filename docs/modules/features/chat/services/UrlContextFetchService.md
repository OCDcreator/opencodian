# UrlContextFetchService

> **源码**: `src/features/chat/services/UrlContextFetchService.ts`
> **状态**: [REVIEW]

## 概述

R-E1（advantage-parity）的网页上下文本地抓取：把用户显式粘贴的 URL 在**发送时**抓取并转为 Markdown，经既有 `<obsidian_context>` 通道进上下文（后端无关）。对标 Copilot 的 URL/YouTube 提及能力，但零云依赖、严格 SSRF 防护。

## 对外 API

```typescript
class UrlContextFetchService {
  fetchItem(item): Promise<PromptContextItem>;        // pending → ok/failed（永不抛）
  resolvePendingItems(items): Promise<items'>;        // 并行抓取，按 id 回填
}
// 纯函数（测试导出）
extractFetchableHostname(url): { hostname } | { rejection };
isPrivateIpv4 / isPrivateIpv6 / isPrivateIpAddress / isBlockedHostnameLiteral;
convertHtmlToMarkdownLite(html): { title, markdown };
buildPendingUrlContextItem(href): PromptContextItem;  // composer 粘贴 → chip
```

## 不变量

- **SSRF 三层防护**（插件自身有本地服务端口，回环必须防）：①前置拒——非 http(s) 方案、私有/回环/保留 IP 字面量（IPv6 含方括号形态）、localhost/`*.local`/`*.internal` 族主机名；②DNS 预解析——解析到任一私有/回环地址即拒（首跳 DNS rebinding）；③重定向手控——`node:http(s)` 逐跳跟随（Obsidian `requestUrl` 不透明地自动跟随，弃用），**每跳重跑①②**，重定向指回 `127.0.0.1`/内网即 `blocked-private-target`；≤5 跳、15s 超时、2MB 响应上限。
- **诚实失败**：失败条目留在上下文里并带 `failureReason`（超时/非网页/抓取错/空内容/YouTube 无字幕/私有目标），序列化标签与 UI chip 双处如实标注，绝不静默剔除；发送侧 Notice 本地化原因。
- **YouTube 语义**：watch 页无可提取字幕文本（转换后正文 < 300 字符）→ `youtube-transcript-unavailable`，不伪造内容。
- **零依赖降级转换**（需求明示可接受）：script/style/noscript/template/svg/head/iframe 全剔除；标题/列表/链接/强调/引用/代码围栏映射；实体解码；按 UTF-8 字节截断到共享上下文预算（60KiB）并标 `truncated`。
- **触发面**：仅用户**显式粘贴**的整段 URL 才成 chip（composer paste 只在「整个粘贴就是一条 URL」时拦截）；消息正文里出现的链接永不自动抓取。
- **注入面**：`partitionExistingContextItems` 豁免 url 条目（自带载荷，无库路径可失效）；序列化器合成 text part（与 PDF 同型，本地/远程模式一致）。

## 关联模块

- `src/core/types/chat.ts`：`PromptContextKind` 增 `url`；`UrlContextMeta`。
- `src/shared/obsidianContext.ts`：`buildUrlContextTag/Body`（ok 载荷或失败头）。
- `src/core/opencode/OpenCodeContextPartSerializer.ts`：`createUrlContextPart`。
- `src/features/chat/services/ComposerInputShellCoordinator.ts`：粘贴 → `attachUrlContextToActiveTab` host 缝。
- `src/features/chat/services/MessageSendPreparationService.ts`：发送时 `resolveUrlContextItems` 缝 + 失败 Notice。
- `src/features/chat/runtime/UserMessageContentRenderer.ts`：已发消息 chip 的「抓取失败」徽标与外链打开。
