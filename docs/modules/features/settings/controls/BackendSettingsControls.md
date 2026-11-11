# BackendSettingsControls

> **源码**: `src/features/settings/controls/BackendSettingsControls.ts`
> **状态**: [REVIEW]

## 概述

后端设置共享控件 owner。为六个后端的设置行提供三个可复用导出：`describeBackendSetting`（给已有 Obsidian `Setting` 附加 scope/effect/risk/default/source 元数据徽章）、`addBackendChoiceSetting`（原生 radio choice 组）、`addBackendSliderSetting`（原生 range + 可见读数 + 可选重置按钮）。目标是让"诚实元数据"（作用域、生效时机、风险、默认值、来源）和失败回滚语义在同一处实现，而不是每个后端 section 各写一份。

遵循 ADR 0001 的诚实证据原则：控件只展示消费者传入的 presentation 元数据与已提交值；`onChange` 成功前绝不推进内部 committed 值，失败时回滚显示并公告本地化的通用失败文案。原始错误对象既不进 DOM 也不进日志——日志只记固定安全类别文案，因为后端错误文本可能携带 endpoint 或凭据内容。

## 导入关系

```text
上游: obsidian.Setting, src/i18n (t/TranslationKey), src/shared (createLogger)
下游: (消费方待接线) settingsLayoutRegistry / SettingsTabbedRenderer / 各后端 section；
      API 契约见 .tmp/backend-refresh-ui/shared-control-contract.json
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `BackendSettingScope` | `'vault' \| 'project' \| 'global' \| 'shared' \| 'session'` |
| `BackendSettingEffect` | `'immediate' \| 'next-turn' \| 'new-session' \| 'reconnect' \| 'restart'` |
| `BackendSettingRisk` | `'low' \| 'medium' \| 'high'` |
| `BackendSettingPresentation` | `key?/scope/effect/risk?/defaultLabel?/source?`；`defaultLabel`/`source` 由调用方预本地化 |
| `BackendChoiceOption` | `value/label/description?/recommended?` |
| `AddBackendChoiceSettingOptions` | `key?/name/description?/value/options/onChange/presentation/disabled?` |
| `AddBackendSliderSettingOptions` | `key?/name/description?/value/min/max/step?/defaultValue?/formatValue?/onChange/presentation/disabled?` |

## 行为合同

### describeBackendSetting(setting, presentation): Setting

- 返回同一 `Setting` 实例，可与 owner 自己的 builder 链式调用。
- 在 `settingEl` 上写 `data-backend-key/scope/effect/risk`。
- 向 `.setting-item-description` 追加 `.opencodian-backend-field-meta`（无描述元素时回退挂到 `settingEl`）；徽章结构为 `.opencodian-backend-field-badge`（修饰类 `-scope`/`-effect`/`-risk`/`-default`/`-source`，risk 另有 `--low/--medium/--high`）+ `.opencodian-backend-field-badge-axis`（本地化轴名）+ `-badge-value`。
- 不触碰 name/description/控件内容，标签所有权仍在各 owner。

### addBackendChoiceSetting(container, opts): Setting

- `new Setting(container)` + `setName/setDesc`（description 为空时也渲染空描述元素，保证徽章有固定落点），控件渲染在 `controlEl`。
- 组容器 `.opencodian-backend-choice-group`，`role="radiogroup"`，`aria-labelledby` 指向 `.setting-item-name`（无则回退 `aria-label`）。
- 每个选项是 `<label.opencodian-backend-choice>` + 原生 `<input type="radio">`；含 `.opencodian-backend-choice-label`、可选 `.opencodian-backend-choice-desc`、可选推荐徽章 `.opencodian-backend-choice-badge`。
- **继承值保留**：`opts.value` 不在 options 中时，最前面插入一个 checked 且 disabled 的 unlisted 选项（`--unlisted`，文案 `settings.backend.choice.unlisted`），绝不静默改为默认值。
- **提交语义**：change → 乐观绘制 → busy（组加 `--is-busy`，全部 input disabled）→ `await onChange` → 成功才更新内部 committed；失败回滚绘制 + 组加 `--has-error`，`.opencodian-backend-choice-error`（`role="status"` + `aria-live="polite"`，常驻挂载）公告本地化通用失败文案；pending 期间的第二次 change 被忽略并恢复 committed 绘制。日志只记固定安全类别文案，不携带原始 error 对象。
- 焦点：radio focus/blur 在所属 label 上切换 `.opencodian-backend-choice--focused`，供 CSS focus-visible 钩子使用。
- 无 `title` 属性；不创建 `<select>`，因此 `searchInputEnhancer` / `SettingsDropdownControl` 的下拉增强器不可能命中 radio。

### addBackendSliderSetting(container, opts): Setting

- 控件根 `.opencodian-backend-slider`（`step > 1` 时加 `--discrete`）内含：min/max 边界 `.opencodian-backend-slider-bound`、原生 range `.opencodian-backend-slider-input`（`aria-label` = name，`aria-describedby` 指向错误区）、`<output>` 读数 `.opencodian-backend-slider-value`（`for` 关联 input、`aria-live="polite"`）、可选重置按钮 `.opencodian-backend-slider-reset`（仅当 `defaultValue` 提供时渲染）、常驻错误区 `.opencodian-backend-slider-error`。
- `input` 事件只更新读数（实时预览）；`change`（释放）才提交：值先 clamp+snap 到 step 网格，busy（`--is-busy`，input+reset disabled）→ `await onChange` → 失败回滚输入值与读数 + `--has-error` + 本地化通用失败公告。日志同样只记固定安全类别文案，不携带原始 error 对象。
- 重置按钮走同一条提交/回滚路径把 `defaultValue` 提交给 `onChange`。
- 初始与重置值都经过 clamp+snap（浮点尘埃用 `toFixed(6)` 清理）。

## 本地化键（由 locales owner 添加，见契约 JSON）

`settings.backend.meta.scope(.vault/.project/.global/.shared/.session)`、`settings.backend.meta.effect(.immediate/.nextTurn/.newSession/.reconnect/.restart)`、`settings.backend.meta.risk(.low/.medium/.high)`、`settings.backend.meta.default`、`settings.backend.meta.source`、`settings.backend.choice.recommended`、`settings.backend.choice.unlisted`、`settings.backend.choice.error`、`settings.backend.slider.reset`、`settings.backend.slider.error`。

除轴名/推荐/重置/失败文案外，所有 name、option label、`defaultLabel`、`source` 均由调用方预本地化传入。

## 状态与样式约定

- 全部视觉由父任务提供的 stylesheet 承担；本模块只输出类名与 data 属性。
- busy/has-error/disabled 状态类：choice 组 `--is-busy`/`--has-error`、slider `--is-busy`/`--has-error`/`--disabled`、choice label `--is-checked`/`--focused`/`--disabled`/`--unlisted`。
- 外部状态同步（例如别的入口改了同一设置）由 owner 重渲染整行完成；本模块故意不暴露 handle/markCommitted API。

## 测试

`tests/unit/features/settings/controls/BackendSettingsControls.test.ts` 覆盖：元数据徽章与 data 属性、radio 组可访问命名与推荐徽章、继承值保留、乐观绘制与 busy、失败回滚与原始错误不进 DOM 也不进 logger（mock src/shared 验证）、pending 并发忽略、禁用态、focus 类、slider snap/clamp、input/change 分离、重置按钮及其失败回滚、无 reset 渲染、无 title 属性。
