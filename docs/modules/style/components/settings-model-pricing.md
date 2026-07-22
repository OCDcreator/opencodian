# settings-model-pricing.css

> **源码**: `src/style/components/settings-model-pricing.css`
> **状态**: [REVIEW]

## 职责

定义本地模型单价管理弹窗的局部布局。它保持 Obsidian settings 的卡片、边框和文本 token，不把成本估算做成账单仪表盘。

## 关键规则

- `.opencodian-model-pricing-modal .modal-content`：纵向 stack，统一 14px 间距。
- `.opencodian-model-pricing-section`：目录状态、编辑表单、已保存覆盖的独立轻量 section，使用主题的 primary background、标准 border 与 10px 圆角。
- `.opencodian-model-pricing-form`：桌面端两列，Provider/Model 与四类 token 单价使用相同的 field rhythm；输入框 `min-width: 0`，避免长 model ID 撑出 modal。
- `.opencodian-model-pricing-override-row`：已保存覆盖采用 identity 左、操作右的行布局，模型 ID 可按任意位置换行，防止 provider/model ref 溢出。
- 520px 以下表单与覆盖行都切为单列，编辑/移除按钮保留在可触及的操作行。

## 维护约束

- 使用 Obsidian token（如 `--background-modifier-border`、`--text-muted`），不硬编码主题色。
- 不将“models.dev 估算”渲染成已付款或订阅额度；视觉上保持普通设置表单权重。
- 若增加 rate 类别，必须同步表单 grid、窄屏断点、`ModelPricingModal`、`pricing.ts` 和 locale 文案。
