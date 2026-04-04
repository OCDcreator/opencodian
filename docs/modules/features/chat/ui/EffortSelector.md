# EffortSelector

> **源码**: `src/features/chat/ui/EffortSelector.ts`
> **状态**: [DRAFT]

## 概述

双模式选择器组件，根据当前模型类型显示不同的推理控制 UI：
- **自适应推理模型**（OpenAI GPT-5 / o1 / o3 / o4 系列）：显示 Effort Level 选择器（minimal → xhigh）
- **自定义模型**：显示 Thinking Budget 选择器（Off / 1K / 4K / 8K / 16K tokens）

两种模式互斥，通过 `isAdaptiveThinkingModel()` 判断当前模型类型。

## 导入关系
上游: `EffortLevel`/`ThinkingBudget`（core/types/settings）、`i18n`
下游: 被 `OpenCodianView` 在工具栏区域实例化

## 核心类型 / 接口

```typescript
const EFFORT_LEVELS: { value: EffortLevel; label: string }[]
// minimal | low | medium | high | xhigh

const THINKING_BUDGETS: { value: ThinkingBudget; label: string; tokens: number }[]
// 0 | 1024 | 4096 | 8192 | 16384

const DEFAULT_EFFORT_LEVEL: EffortLevel = 'high'
const DEFAULT_THINKING_BUDGET: ThinkingBudget = 4096

interface EffortSelectorCallbacks {
  onEffortLevelChange: (effort: EffortLevel) => Promise<void>;
  onThinkingBudgetChange: (budget: ThinkingBudget) => Promise<void>;
  getEffortLevel: () => EffortLevel;
  getThinkingBudget: () => ThinkingBudget;
  getCurrentModel: () => string;
}

function isAdaptiveThinkingModel(model: string): boolean
```

## 核心逻辑

### 模型检测

`isAdaptiveThinkingModel()` 检查模型 ID 是否以 `openai/` 开头且包含 `/gpt-5`、`/o1`、`/o3`、`/o4`。

### 双模式切换

`updateDisplay()` 根据当前模型类型：
- adaptive → 显示 `effortEl`，隐藏 `budgetEl`
- 非 adaptive → 隐藏 `effortEl`，显示 `budgetEl`

### 下拉菜单

点击当前值触发 `toggleMenu()`，显示选项列表。选项按 reverse 排序（最大值在前）。点击外部区域或按 Escape 关闭菜单。

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(parentEl, callbacks)` | 创建容器、两组 DOM（effort + budget），注册 document mousedown/keydown 监听 |
| `updateDisplay()` | 根据模型类型切换显示模式，重新渲染齿轮按钮 |
| `renderEffortGears()` | 渲染 effort level 下拉选项 |
| `renderBudgetGears()` | 渲染 thinking budget 下拉选项，附带 token tooltip |
| `isEffortModel(model)` | 代理 `isAdaptiveThinkingModel()` |
| `getElement()` | 返回容器 HTMLElement |
| `destroy()` | 移除 document 监听、关闭菜单、移除 DOM |

## 数据流

```
getCurrentModel() → isAdaptiveThinkingModel()
        ↓
   adaptive? ──yes──→ renderEffortGears() → onEffortLevelChange()
        │
        no
        ↓
   renderBudgetGears() → onThinkingBudgetChange()
```

## 与其他模块的交互

- **OpenCodianView**: 持有实例，通过 `EffortSelectorCallbacks` 读写设置并触发保存
- **core/types/settings**: `EffortLevel`、`ThinkingBudget` 类型定义

## 配置项

- `DEFAULT_EFFORT_LEVEL = 'high'`
- `DEFAULT_THINKING_BUDGET = 4096`

## 注意事项

- `tooltipLabelId` 是静态递增计数器，用于无障碍
- document mousedown/keydown 使用捕获阶段（`true`）确保在其他元素之前处理
- 两个菜单互斥，`activeMenu` 追踪当前打开的菜单

## 待补充
- [ ] EffortLevel 和 ThinkingBudget 如何传递到 SDK / OpenCode API 调用
- [ ] 更多模型厂商的自适应推理模型支持（如 Claude extended thinking）
