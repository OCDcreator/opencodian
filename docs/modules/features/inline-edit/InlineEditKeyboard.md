# InlineEditKeyboard

> **源码**: `src/features/inline-edit/InlineEditKeyboard.ts`
> **状态**: [REVIEW]

## 概述

行内编辑预览态的文档级键盘分派器（flowtext-parity R-A5 焦点归属）。**每个 document 只挂一个** capture 阶段 keydown 监听，由该文档内所有编辑共享——这是多编辑的正确性关键：若按编辑各挂监听，A 的接受处理会把焦点登记改到 B，同一 keydown 会继续触发 B 的监听，一次 Enter 接受两个编辑（契约测试锁定此回归）。

分派规则：只作用于控制器登记的「当前编辑」（面板 focusin / 最新预览渲染时登记）；仅 `preview` 相位响应；Enter=接受、Esc=拒绝；所有分支带 `!event.isComposing` 保护中文输入法。

## 公开接口

```typescript
class InlineEditKeyboardDispatcher {
  constructor(deps: { getFocusedEdit(); accept(editId); reject(editId?) })
  bind(documentRef: Document): void     // 首个编辑打开时
  unbind(documentRef: Document): void   // 最后一个编辑关闭时
}
```

## 依赖

- 无（控制器注入回调）
