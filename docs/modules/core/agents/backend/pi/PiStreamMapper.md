# PiStreamMapper

> 源码: src/core/agents/backend/pi/PiStreamMapper.ts

## 职责

转换文本、思考、工具进度/结果、文件编辑和用量；保留details和图片。错误尝试不能提前结束可重试回合，未知加法事件可忽略。toPiChatMessages 恢复原生ID、思考、工具参数/结果、图片及可见扩展消息，隐藏 display=false 消息。

buildPiPrompt 保留文件/选择上下文与图片；buildPiUsageSnapshot 分开当前上下文占用、累计计费和真实总费用。请求结束由服务响应决定。

## 验证

PiAdapter.test.ts、SDK验收脚本、Test Vault；不得导入其他后端实现。
