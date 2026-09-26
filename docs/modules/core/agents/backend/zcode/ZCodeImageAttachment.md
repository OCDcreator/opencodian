# ZCodeImageAttachment

> 源码: src/core/agents/backend/zcode/ZCodeImageAttachment.ts

> 2026-09-24 (票 07)：图片附件本地校验与诚实可用性裁决的唯一模块。

## 职责

本地校验（`validateZCodeImageAttachment`）：媒体类型限定 image/png|jpeg|gif|webp；非空合法 base64；解码字节数 ≤ 5 MiB（低于 app-server 的 8 MiB 单帧上限）。`toZCodeImageInput` 映射桌面端实际使用的 `{kind:"image", filename, mimeType, sizeBytes, dataBase64}` 形状。官方运行时的 `HYa`/`GYa` 将其转换为模型输入的 data URL；此前五种形状均未走到该转换。发送前要求实时目录确认当前模型支持图像，并用目标会话的 `session/read` 再核对模型身份。无图像能力或非法数据保持零发送。

隔离原生探针已证明该形状被 `session/send` 接受，`session/read` 的用户消息含 `file`、`mime=image/png` 和图像 URL。当前本机提供商的纯文本及图像回合都因上游模型请求失败，尚无模型识图回复；票 07 的产品路径验收仍未完成。

## 验证

tests/unit/core/agents/backend/ZCodeImageAttachment.test.ts 与 ZCodeAdapter.chat.test.ts：非法数据零 dispatch、原生形状映射、具备图像能力时发送、恢复附件身份直通。还需 Test Vault 和模型识图读回。
