# Backend Session Browser Styles

> **源码**: `src/style/components/backend-session-browser.css`
> **最近更新**: 2026-06-06

## 概述

`BackendSessionBrowserModal` 的样式表。双栏布局（左侧列表 + 右侧预览），底部操作栏。

## 布局

- `.opencodian-backend-session-browser-container`: flex 双栏容器
- `.opencodian-backend-session-browser-list`: 左侧固定 240px 列表
- `.opencodian-backend-session-browser-preview`: 右侧弹性预览区

## 关键类

- `.opencodian-backend-session-browser-item`: 会话列表项
- `.opencodian-backend-session-browser-item.is-selected`: 选中状态
- `.opencodian-backend-session-browser-preview-msg-user` / `-assistant`: 消息角色背景
- `.opencodian-backend-session-browser-footer`: 底部按钮栏
