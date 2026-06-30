# Claude Code Settings UI Audit - 2026-06-28

## Scope

First-phase Settings redesign for the Claude Code backend settings surface. This pass deliberately avoids a full Settings rewrite and keeps existing Obsidian `Setting` controls, save logic, i18n keys, runtime readbacks, and proof-state data attributes intact.

## Current Issues

- Claude Code settings already use semantic groups, but the rows, readbacks, and notices had uneven density and too much local visual weight.
- Readback/output areas mixed paragraph lists and status content without a consistent inner-row rhythm, so runtime evidence felt like a dump instead of a control-surface state.
- Long descriptions were already collapsed into help affordances, but the surrounding row layout still read more like stacked cards than compact product settings.
- The section needed a stronger reusable pattern for future Settings slices: flat semantic group, compact row card, status/readback strip, and nested metadata rows without nested card chrome.

## shadcn/ui Patterns Reviewed

- **Tabs**: suitable as the existing primary/secondary tab model; no React import needed.
- **Card / CardHeader / CardContent**: suitable as structure only. Claude Code keeps flat group headers and row-card content rather than wrapping every group in another full card.
- **Separator**: suitable only as rhythm between metadata rows; avoided as visible vertical divider noise.
- **Badge**: suitable for proof/status semantics. Existing proof chips and status-tinted readbacks keep this behavior.
- **Button**: suitable as compact outline/ghost actions. Existing Obsidian buttons are styled toward this pattern.
- **Input / Select / Switch**: suitable. Existing Obsidian controls keep native behavior but adopt tighter radius, height, and row alignment.
- **Accordion**: partially suitable for future advanced groups; not used in this pass because current advanced sandbox controls must remain visible and testable.
- **Tooltip**: suitable. Existing group/setting help buttons already use `SettingsTooltipController`.
- **ScrollArea**: suitable for future long runtime readbacks; this pass instead improves in-panel rows without changing interaction.
- **Alert**: suitable for boundary/lifecycle/readback notices, but with state-honest subdued fills.
- **Sheet / Drawer**: not suitable for this first phase. Settings live in an Obsidian settings pane, and a drawer would add stacked chrome without solving the core density issue.

## First-Phase Decision

Target: `SettingsClaudeCodeSection` visual language, especially Runtime / Tools readback-heavy rows and all Claude Code setting rows.

Design decisions:

- Keep groups flat and semantic; do not turn each group into a full card.
- Use a compact two-column setting-row layout on desktop and collapse to one column below 720px.
- Preserve all proof/readback/boundary data attributes so tests, DOM probes, and accessibility carriers remain stable.
- Style runtime ecosystem and MCP readback details as lightweight inner rows, not nested cards.
- Reuse Obsidian theme variables and existing settings layout tokens; no new dependency, no Tailwind, no shadcn runtime.

## Follow-Up Slices

- Apply the same row/readback rhythm to MCP and provider settings object lists.
- Move the longest runtime readbacks into modal or scroll-area surfaces where the content is diagnostic rather than continuously scannable.
- Consider a real disclosure/accordion treatment for advanced sandbox controls after screenshot review confirms the current visible advanced surface remains too long.
