# Backend Session Browser Styles

> **源码**: `src/style/components/backend-session-browser.css`
> **最近更新**: 2026-06-06

## 概述

`BackendSessionBrowserModal` 的样式表。双栏布局（左侧列表 + 右侧 preview/detail 面板），底部操作栏。

## 布局

- `.opencodian-backend-session-browser-container`: flex 双栏容器
- `.opencodian-backend-session-browser-list`: 左侧固定 240px 列表
- `.opencodian-backend-session-browser-preview`: 右侧弹性 preview/detail 区

## 关键类

- `.opencodian-backend-session-browser-item`: 会话列表项
- `.opencodian-backend-session-browser-item.is-selected`: 选中状态
- `.opencodian-backend-session-browser-preview-notice`: preview 模式说明卡片，提示当前内容不是完整 transcript
- `.opencodian-backend-session-browser-preview-msg-user` / `-assistant`: 消息角色背景
- `.opencodian-backend-session-browser-detail-metadata`: detail 模式 metadata card 容器
- `.opencodian-backend-session-browser-detail-field`: metadata label/value 行
- `.opencodian-backend-session-browser-detail-field-label` / `-value`: metadata 字段标签和值
- `.opencodian-backend-session-browser-detail-transcript`: detail 模式完整 transcript 容器
- `.opencodian-backend-session-browser-detail-message`: transcript 消息块
- `.opencodian-backend-session-browser-detail-role`: transcript 角色标题
- `.opencodian-backend-session-browser-detail-text`: 可滚动 transcript 文本区
- `.opencodian-backend-session-browser-detail-btn.is-disabled`: detail 按钮禁用态
- `.opencodian-backend-session-browser-footer`: 底部按钮栏

## 维护记录

- 2026-06-06: 增加 preview notice、detail metadata card、detail transcript message/text、detail role header 和 detail button disabled state 样式，支持 `BackendSessionBrowserModal` 的 preview/detail 双模式展示。
