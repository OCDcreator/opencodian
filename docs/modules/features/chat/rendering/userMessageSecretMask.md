# userMessageSecretMask

> **源码**: `src/features/chat/rendering/userMessageSecretMask.ts`
> **状态**: [REVIEW]

## 概述

已发送用户文字的**展示层凭据遮罩**实现模块（2026-11-10 从 `userMessageDisplay.ts` 拆出，同一 owner `feature.chat-rendering`）。`maskUserMessageSecretsForDisplay()` 把识别到的凭据值替换为固定 8 个 `•`（`USER_MESSAGE_SECRET_MASK_TEXT`）；只影响展示与默认复制输出，持久化消息、模型输入、rewind/fork/编辑源不经过此模块。

## 导出

```typescript
maskUserMessageSecretsForDisplay(text: string): string
USER_MESSAGE_SECRET_MASK_TEXT: string
```

`userMessageDisplay.ts` re-export 这两个符号，`UserMessageContentRenderer` 经由该 re-export 消费。

## 检测管线（顺序固定）

1. **有界 markup 解码**（`decodeUserMessageMarkupBounded`）：仅数值 HTML 实体（`&#NNN;`/`&#xHH;`，1-7 位/1-6 位）、小集合命名实体（amp/lt/gt/quot/apos/nbsp）与 `%XX` 百分号转义，单遍、定长，不做递归/嵌套/base64 解码；带 raw→decoded 索引映射，命中的区间映射回原文进行遮罩。
2. **共享模式子集**：`DIAGNOSTIC_REDACTION_PATTERNS`（shared.foundation）按索引复用（索引由测试钉住），刻意排除伤散文的两条（独立 `bearer <词>`、裸 `key=<20+>`）；共享行为零修改。
3. **展示侧 provider 形态**：`sk-`（需熵）/`ghp_`/`github_pat_`/`glpat-`/`xox[baprs]-`/`AKIA…`/`AIza…`/`hf_`/JWT/`<32hex>.<16>`，无需字段名。
4. **有界线性赋值扫描**（`collectUserMessageAssignmentRanges`）：以每个 `:`/`=` 分隔符为锚的指针行走，名字上限 64、值上限 1024 字符；值支持引号（`"`/`'` 转义感知、Markdown 反引号）、普通可打印 ASCII（遇空白/非 ASCII/标点/`<` 截断）；`Bearer`/`Basic` scheme 词后取下一个 token；收尾标点/引号不进掩码。字段名判定 `isCredentialFieldName()`（snake/kebab/camel/SCREAMING_SNAKE `_KEY`；`token_count`/`token_limit`/`tokenPolicy` 等描述性后缀不算凭据字段）。
5. **强上下文豁免**：`Authorization`/`Bearer` 头、`api_key`/`access_token` 等复合名不套"词典词"散文启发式；弱名（裸 `password:`/`token:`）仍保留该保护；`=` 赋值与引号字段名视为配置语法。
6. **占位符保护**：`${VAR}`、`{{NAME}}`、`<your-token>`、`[REDACTED]`、`your_api_key`、已知填充词、低熵填充不遮；掩码幂等。

## 模块关系

- 上游依赖：`src/shared/diagnosticSecretSanitizer.ts`（只读复用，行为不变）
- 下游消费者：`userMessageDisplay.ts`（re-export）→ `UserMessageContentRenderer`
- 遮罩后的 `•`×4+ 连续段由 `userMessageDisplay.ts` 投影为 `kind: 'secret'` 高亮 span（类名 `opencodian-message-highlight-secret`，无 title/aria 属性）
