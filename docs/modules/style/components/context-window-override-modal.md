# context-window-override-modal.css

> **源码**: `src/style/components/context-window-override-modal.css`
> **状态**: [REVIEW]

## 概述

R-F8（advantage-parity）上下文窗口声明 modal 的样式：三输入横排表单（供应商/模型 flex-1 + 窗口 120px number）、声明列表行（等宽字体 ref + muted 窗口数 + 移除按钮）、空态小字。全取 Obsidian 主题变量。

## 关键类

- `.opencodian-context-window-override-form`：横排 flex + 6px 间距。
- `.opencodian-context-window-override-row`：次级背景行，ref 省略号截断。
