# TurnCompletionSoundService

> **源码**: `src/features/chat/services/TurnCompletionSoundService.ts`
> **状态**: [REVIEW]

## 概述

R-D3（advantage-parity）的轮次完成提示音：聊天轮次完成时播放一声短促双音提示（C6→E6 正弦 + 指数衰减，16-bit 单声道 WAV 内嵌为 base64 常量，无外部资产文件），继承两个对标插件的「agent 完成时叫我」能力。

## 对外 API

```typescript
class TurnCompletionSoundService {
  playForTurnCompletion(settings, context): { played, reason };
}
// 纯函数
resolveTurnCompletionSoundSource(settings, host): { url, degradedToBuiltin };
```

## 不变量

- **触发门（需求原文）**：仅「后台任务会话」或「Obsidian 窗口未聚焦」时播放；前台正在看的普通轮次绝不发声；默认关闭。
- **触发点**：`main.ts saveConversation`——`lastResponseAt` 前进（新助手回复落地）即视为轮次完成。
- **音源**：内置 base64 WAV；或用户配置的库内相对音频文件（经 `vault.getResourcePath` 解析）；不可解析 → 本地化 Notice + 回退内置（诚实降级）。
- **失败隔离**：`Audio.play()` 拒绝（自动播放策略/解码失败）只记日志，绝不影响聊天路径；`Audio` 构造失败如实返回 `no-audio`。
- **可测性**：audio 构造与宿主状态（聚焦/资源路径/Notice）均为注入缝。

## 关联模块

- `src/main.ts`：组合根（getResourcePath/isWindowFocused/Notice 注入）+ `saveConversation` 触发点。
- `src/features/settings/SettingsConversationSection.ts`：设置行（开关 + 自定义路径，display 块）。
- `src/core/types/settings.ts`：`turnCompletionSoundEnabled`（默认关）/ `turnCompletionSoundPath` + 归一化。
