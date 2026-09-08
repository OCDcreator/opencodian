# PiExtensionUiHost

> 源码: src/features/chat/services/PiExtensionUiHost.ts

## 职责

适配select、confirm、input、editor、notify、setStatus、setWidget、setTitle、set_editor_text九种标准UI。交互由用户回复/取消，AbortSignal关闭对应Modal。登录通知提供URL链接。

状态/文本widget和编辑器只定位相同Pi会话；使用DOM文本API，不执行扩展HTML。终端自定义组件属于不支持的主机能力。

## 验证

SDK脚本验证9方法往返，Test Vault验证真实Obsidian主机，详见Pi验收报告。
