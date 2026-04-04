# QuestionDock

> **源码**: `src/features/chat/ui/QuestionDock.ts`
> **状态**: [DRAFT]

## 概述

Question Dock 是输入框上方的浮动面板，用于展示 OpenCode 服务端的交互式问题请求。支持两种显示模式（`single` / `all`），按 header 分组的标签页导航，以及 radio/checkbox 选项 + 自定义文本输入。用户提交答案后通过回调传递回上层。

## 导入关系
上游: `obsidian`（setIcon）、`QuestionDisplayMode`/`QuestionRequest`（core/types）、`i18n`、`questionDockState`（buildQuestionDockViewModel、isQuestionAnswerComplete）
下游: 被 `OpenCodianView` 在输入区域上方实例化

## 核心类型 / 接口

```typescript
interface QuestionDockRenderState {
  request: QuestionRequest | null;
  answers: string[][];
  displayMode: QuestionDisplayMode;
  activeGroupKey?: string | null;
  activeQuestionIndex?: number | null;
}

interface QuestionDockCallbacks {
  onAnswerChange: (questionIndex: number, answer: string[]) => void;
  onSelectGroup: (groupKey: string) => void;
  onSelectQuestion: (questionIndex: number) => void;
  onSubmit: () => void;
  onReject: () => void;
  onClose: () => void;
}
```

## 核心逻辑

### 渲染流程

`render(state, callbacks)` 每次调用清空 DOM 并重建：
1. **Header**: 图标 + 标题 + 进度信息（single 模式显示步骤，all 模式显示完成计数）+ 关闭按钮
2. **Tabs**: 当 group 数 > 1 时显示分组标签页，每个标签显示 `answeredCount/totalCount`
3. **Body**: 根据 `viewModel.visibleQuestions` 渲染问题卡片
4. **Footer**: 提交 + 拒绝按钮

### 问题卡片

每个问题包含：
- header 文本 + body 文本
- 选项列表（radio 或 checkbox，取决于 `question.multiple`）
- 自定义文本输入（当 `question.custom !== false`）

### 答案收集

`collectAnswerFromSection()` 从 DOM 中读取：
1. 所有 checked 的 checkbox/radio 的 value
2. 自定义输入框的值
3. multiple 模式合并去重；单选模式优先取自定义值

### 显示模式

- `single`: 一次显示一个问题，footer 按钮文本为 "下一步"/"提交"
- `all`: 显示当前 group 的所有问题，已回答的问题标记 `is-answered`

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(parentEl)` | 创建 `is-hidden` 根容器 |
| `render(state, callbacks)` | 清空重建完整 dock UI |
| `renderHeader(viewModel, displayMode, callbacks)` | 标题、进度、关闭按钮 |
| `renderTabs(viewModel, callbacks)` | 分组标签页 |
| `renderBody(viewModel, displayMode, callbacks)` | 问题卡片列表 |
| `renderFooter(viewModel, displayMode, sectionElements, callbacks)` | 提交/下一步 + 拒绝按钮 |
| `collectAnswerFromSection(container, question)` | 从 DOM 读取当前答案 |
| `destroy()` | 移除根元素 |

## 数据流

```
QuestionRequest + answers[] + displayMode + activeGroup/activeIndex
        ↓
buildQuestionDockViewModel() → QuestionDockViewModel
        ↓
render() → Header + Tabs + Body + Footer
        ↓
用户交互 → onAnswerChange / onSelectGroup / onSelectQuestion / onSubmit / onReject / onClose
```

## 与其他模块的交互

- **questionDockState**: 提供 `buildQuestionDockViewModel()`、`isQuestionAnswerComplete()` 纯函数
- **OpenCodianView**: 持有 `QuestionDock` 实例，管理 `QuestionDockRenderState`，处理回调
- **i18n**: `chat.question.*` 命名空间

## 配置项

- `questionDisplayMode`: `'single'` | `'all'`，来自插件设置
- `questionCardPosition`: `'inline'` | `'above_input'`，决定 dock 是否显示

## 注意事项

- 每次 `render()` 完全重建 DOM，无增量更新
- `collectAnswerFromSection()` 直接操作 DOM，与 render 紧耦合
- `is-hidden` CSS 类控制可见性，非 display:none

## 待补充
- [ ] QuestionRequest 的完整类型定义（来自 core/types）
- [ ] single 模式下的步骤导航与 onAnswerChange 时序
