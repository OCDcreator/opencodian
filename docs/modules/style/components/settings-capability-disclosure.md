# Settings Capability Disclosure Styles

> **源码**: `src/style/components/settings-capability-disclosure.css`
> **状态**: [FINAL]

## 职责

为只读 SDK 能力披露块（`.opencodian-capability-disclosure-host` / `.opencodian-capability-disclosure`）和实验性能力开关块（`.opencodian-experimental-capability-gates`）提供局部布局样式。这两个容器此前没有任何 CSS，内部的 cardified `.setting-item` 行回退到全局 `.setting-item + .setting-item { margin-top: 0 }` 覆盖，导致相邻卡片之间零间距、彼此相贴。此文件沿用 `settings-capability-lab.css` 中 `[data-section-block]` 的既有 card + flex gap 约定，使这些分组的设置行与面板内其他分组容器保持一致的呼吸节奏，不引入新的视觉语言。

## 关键类名

- `.opencodian-capability-disclosure-host`: 由 `SettingsServerSection.renderCapabilityDisclosure` 创建的外层 host 容器，内包 `.opencodian-capability-disclosure`。host 设为透明、无边框、无圆角的纯布局层，避免与内部 disclosure 卡片形成双层边框。
- `.opencodian-capability-disclosure`: 由 `renderCapabilityDisclosureRows` 添加的内层容器，承载 subsection heading、各 `.opencodian-capability-row` 行以及 `.opencodian-capability-disclosure-footer`。flex column + `space-md` gap，复用 host 的 card 视觉（border / radius / background 由 host 的 7+ 复用点决定，本容器只控制内部 rhythm）。
- `.opencodian-experimental-capability-gates`: 由 `SettingsServerSection.renderExperimentalGates` 创建的实验性开关分组容器，内含 subsection heading 与 3 个 `.opencodian-capability-row` 行（PTY / 会话迁移 / 项目副本）。完整承担 section card（border / radius / background / padding 14px / `space-md` gap），与 `[data-section-block]` 容器等价。
- `.opencodian-capability-disclosure-heading`, `.opencodian-experimental-capability-gates > .opencodian-settings-subsection-heading`: 子区标题，14px / 700 / line-height 1.35，与 capability-lab block 标题一致。
- `.opencodian-capability-disclosure-footer`: 承载共享 Re-check 按钮的尾部行，顶部加 `space-xs` 微间距与上方状态行区分，但不破坏整体 card rhythm。

## 关联 TS 组件

- `src/features/settings/capabilityDisclosureRow.ts`（生成 `.opencodian-capability-disclosure` / `.opencodian-capability-row` / `.opencodian-capability-disclosure-footer`）
- `src/features/settings/SettingsServerSection.ts`（生成 `.opencodian-capability-disclosure-host` / `.opencodian-experimental-capability-gates`）
- 复用 `.opencodian-capability-disclosure-host` 的同级 section：`SettingsModelSection`、`SettingsSecuritySection`、`SettingsSkillSection`、`SettingsAgentsSection`、`SettingsCommandsSection`、`SettingsMcpSection`。

## 修改注意点

- `.opencodian-capability-disclosure-host` 在 7+ 个 section 中被复用；改 host 的 card 视觉前先确认所有复用点，避免误伤。本文件刻意把 host 设为透明布局层、把 card 责任留给内层 disclosure 或外层调用方，以保持现有视觉不变。
- 实验 gates 与 disclosure 都依赖全局 `.setting-item + .setting-item { margin-top: 0 }` 覆盖（`settings-layout-contract.css`），因此内部 rhythm 必须由父容器的 flex `gap` 提供；不要在单个 `.setting-item` 上恢复 margin-top，否则会破坏全局 card rhythm 约定。
- 间距 token 使用 `--opencodian-settings-space-md`（8px）以匹配 `[data-section-block]`，不要改成 `space-lg` 等其他档位，否则与同 section 内其他分组容器节奏不一致。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
