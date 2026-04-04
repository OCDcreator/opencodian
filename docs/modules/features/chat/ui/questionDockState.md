# questionDockState

> **源码**: `src/features/chat/ui/questionDockState.ts`
> **状态**: [REVIEW]

## 概述

Question Dock 的纯函数状态管理层。负责将 `QuestionRequest` + 用户草稿答案 + 显示选项转换为 `QuestionDockViewModel`，供 `QuestionDock` 组件渲染。包含问题分组、答案规范化、完成度检测、活动问题索引推导等逻辑。

## 导入关系
上游: `QuestionDisplayMode`/`QuestionPrompt`/`QuestionRequest`（core/types）
下游: `QuestionDock`（UI 层）

## 核心类型 / 接口

```typescript
interface QuestionDockGroup {
  key: string;
  label: string;
  questionIndexes: number[];
  answeredCount: number;
  totalCount: number;
}

interface QuestionDockQuestionView {
  index: number;
  question: QuestionPrompt;
  answer: string[];
  answered: boolean;
}

interface QuestionDockViewModel {
  groups: QuestionDockGroup[];
  activeGroupKey: string;
  activeQuestionIndex: number;
  visibleQuestions: QuestionDockQuestionView[];
  answeredCount: number;
  totalCount: number;
  currentStep: { current: number; total: number } | null;
}

interface QuestionDockSelectionOptions {
  activeGroupKey?: string | null;
  activeQuestionIndex?: number | null;
  displayMode: QuestionDisplayMode;
}
```

## 核心逻辑

### 答案规范化

`normalizeQuestionDraftAnswers(totalQuestions, answers)`: 确保返回与问题总数等长的 `string[][]`，缺失项填充空数组。

### 完成度检测

`isQuestionAnswerComplete(question, answer)`: 检查答案数组中是否有至少一个非空字符串。

### 问题分组

`buildQuestionGroups(request, answers)`: 按 `question.header` 字段分组。同一 header 下的多个问题归入同一组，每组跟踪 `answeredCount` / `totalCount`。

### 组内优先问题索引

`getPreferredQuestionIndexForGroup(request, answers, groupKey)`: 返回组内第一个未回答问题的索引；若全部已回答则返回第一个。

### ViewModel 构建

`buildQuestionDockViewModel(request, answers, options)`: 主函数，组合以上逻辑：
1. 规范化答案
2. 构建分组
3. 推导 activeGroupKey 和 activeQuestionIndex
4. 根据 displayMode 确定可见问题列表
5. 计算 currentStep（仅 single 模式）

## 关键方法

| 方法 | 说明 |
|------|------|
| `normalizeQuestionDraftAnswers(total, answers)` | 填充答案数组至指定长度 |
| `isQuestionAnswerComplete(question, answer)` | 判断问题是否有有效答案 |
| `buildQuestionGroups(request, answers)` | 按 header 分组并统计完成度 |
| `getPreferredQuestionIndexForGroup(request, answers, groupKey)` | 组内第一个未回答问题的索引 |
| `buildQuestionDockViewModel(request, answers, options)` | 构建完整 ViewModel |

## 数据流

```
QuestionRequest + answers[][] + QuestionDockSelectionOptions
        ↓
normalizeQuestionDraftAnswers()
buildQuestionGroups()
        ↓
推导 activeGroupKey / activeQuestionIndex
        ↓
确定 visibleQuestions（single: 1个 / all: 组内全部）
        ↓
QuestionDockViewModel
```

## 与其他模块的交互

- **QuestionDock**: 调用 `buildQuestionDockViewModel()` 和 `isQuestionAnswerComplete()`
- **core/types**: `QuestionRequest`、`QuestionPrompt`、`QuestionDisplayMode`

## 配置项

无直接配置项。行为由 `QuestionDockSelectionOptions.displayMode` 控制。

## 注意事项

- 所有函数均为纯函数，无副作用
- `activeGroupKey` 推导优先级：`options.activeGroupKey` → 从 `activeQuestionIndex` 反推 → `groups[0].key`
- `activeQuestionIndex` 在 `all` 模式下强制使用组内首选索引

## 补充说明

- `QuestionPrompt` 完整字段：`header: string`（分组标签）、`question: string`（问题文本）、`options: { label: string; description?: string }[]`（预设选项列表）、`multiple: boolean`（是否多选）、`custom: boolean`（是否允许自定义输入）
- single 模式下步骤导航边界：当最后一个问题未回答时提交按钮文本为 "提交"，中间步骤为 "下一步"；在 `renderFooter` 中通过 `viewModel.currentStep.current < viewModel.totalCount` 判断
