# Settings Capability Lab Styles

> **源码**: `src/style/components/settings-capability-lab.css`
> **状态**: [REVIEW]

## 职责

定义 Debug > Capability Lab 诊断页的局部样式。该文件只负责实验能力面板的视觉层级、能力矩阵、诊断摘要、状态芯片、只读输出、sessionStore/structured-output/hooks runtime proof 控件，以及只读消息预览列表，不承担通用 settings layout token 的定义。

## 关键类名

- `.opencodian-capability-lab-banner`: 顶部实验性警告横幅，使用 warning token 明确 DIAGNOSTIC / EXPERIMENTAL / NOT STABLE。
- `.opencodian-capability-lab-summary`: 三列诊断边界摘要，说明面板只用于诊断、运行时证明不持久化、写操作只读或 dry-run。
- `.opencodian-capability-lab-table-shell`: 能力矩阵横向滚动容器，防止窄宽度下 header 和状态芯片互相挤压。
- `.opencodian-capability-lab-matrix`: 能力矩阵表格，最后一列为 `User Surface`，以 `Settings` / `Diagnostic` / `Hidden` 区分用户可见程度。
- `.opencodian-capability-lab-chip`: SDK、adapter、runtime proof、surface 等状态芯片的共享基线。
- `.opencodian-capability-lab-output`, `.opencodian-capability-lab-status`, `.opencodian-capability-lab-subagent-list`: 诊断输出和只读列表 surface。
- `.opencodian-capability-lab-preview-list`, `.opencodian-capability-lab-preview-row`, `.opencodian-capability-lab-preview-meta`, `.opencodian-capability-lab-preview-text`: history browser 的紧凑消息预览行，避免 Capability Lab 退化成整块 JSON dump。
- `.opencodian-capability-lab-chip-pass`, `.opencodian-capability-lab-chip-untested`, `.opencodian-capability-lab-chip-fail`, `.opencodian-capability-lab-chip-wiring`, `.opencodian-capability-lab-chip-boundary`: 能力矩阵 runtime proof 状态芯片。`pass` 为成功（绿色），`untested` 为未测试（琥珀色），`wiring` 和 `boundary` 为仅接线/边界触发（琥珀色），`fail` 为失败（红色）。`wiring` 与 `fail` 视觉上必须区分：前者是 warning 级别（SDK options 已接受，行为未验证），后者是 error 级别（runtime 验证尝试后失败）。
- `.opencodian-capability-lab-proof-marker`, `.opencodian-capability-lab-proof-pass`, `.opencodian-capability-lab-proof-fail`, `.opencodian-capability-lab-proof-untested`, `.opencodian-capability-lab-proof-wiring`, `.opencodian-capability-lab-proof-boundary`: 运行时证明 inline marker。`pass` 为成功（绿色），`fail` 为失败（红色），`untested` 为未测试（琥珀色），`wiring` 为仅验证选项被 SDK 接受但未验证真实行为（琥珀色，标签显示 "Wiring only — not behavior verified"），`boundary` 为工具边界被触发但诊断路径缺少 UI 上下文（琥珀色，标签显示 "Boundary hit — UI context missing"）。
- `.opencodian-capability-lab-json-preview`: JSONL / runtime proof 预览区，使用 monospace、内部滚动和自动换行。

## 设计约束

- 复用 `settings-layout-contract.css` 提供的 `--opencodian-settings-*` token，不重新定义设置页全局半径、边框、背景或间距。
- 视觉必须保持 Obsidian-native、dense but not crowded；不使用营销式 hero、重 dashboard 卡片、渐变文字或装饰性玻璃。
- `Diagnostic`、`Hidden`、`Untested` 等状态不能被弱化成完成态；未验证能力不得通过样式看起来像稳定功能。
- sessionStore import / mirror proof 虽然是诊断性写入，但视觉上仍必须强调它们是 isolated diagnostic actions，而不是 stable restore/import UI。
- 横向滚动只用于矩阵和发现表，其他控件在窄屏换行或占满宽度。

## 修改注意点

- 修改源码结构时同步 `docs/modules/features/settings/SettingsCapabilityLabSection.md` 的类名说明。
- 修改 CSS 后运行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。
