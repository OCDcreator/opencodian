# Composer popover shadcn Command redesign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the three Composer card surfaces around one Obsidian-native shadcn `Popover + Command` visual system without changing their behavior.

**Architecture:** Keep the existing `ComposerPopoverFrame` and TypeScript coordinators as the behavior and accessibility owners. Rework only the shared frame and selector CSS, using shared custom properties in `composer-popover-frame.css`; card-specific styles only supply Agent description layout, Permission semantic icon/check color, and Model CommandInput/group/list sizing.

**Tech Stack:** Obsidian DOM helpers, TypeScript, generated CSS, Jest, Puppeteer viewport regression, Test Vault runtime QA.

## Global constraints

- No shadcn, Radix, cmdk, Tailwind, web-font, or external-asset dependency.
- Preserve three independent card triggers, keyboard contracts, Scope Escape focus restoration, ARIA relationships, model 280px list viewport, sticky headers, and responsive 8px inset.
- Use Obsidian theme variables and `color-mix`; no raw palette values, gradients, glass, colored rails, or nested-card treatment.
- Do not alter unrelated Composer behavior or refactor guarded owners.

---

### Task 1: Establish shared Command-popover tokens and rows

**Files:**
- Modify: `src/style/components/composer-popover-frame.css`
- Test: `tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts`

**Interfaces:**
- Consumes: existing `.opencodian-composer-popover-frame`, header, content, footer, section, option, icon, check selectors.
- Produces: common Command-style surface/row states used by Agent, Permission, and Model selectors.

- [ ] Write or revise a style-contract assertion for a 10px shared radius, neutral Command selected state, visible focus, and no glass/gradient/left-rail declarations.
- [ ] Run `npm test -- --runInBand tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts` and observe a red failure if the contract is not represented.
- [ ] Implement shared custom properties, a single border/shadow surface, compact header/footer, 4px list inset, 6px rows, neutral hover/highlight/selected background, and reduced-motion handling.
- [ ] Run the same test to green.

### Task 2: Adapt selector-specific content to the Command anatomy

**Files:**
- Modify: `src/style/components/agent-selector.css`
- Modify: `src/style/components/permission-mode-selector.css`
- Modify: `src/style/components/model-selector.css`
- Modify only if structure is indispensable: `src/features/chat/ui/ComposerPopoverFrame.ts`
- Tests: existing selector and model viewport tests.

**Interfaces:**
- Consumes: shared row/frame styles from Task 1.
- Produces: Agent description rows, Permission scoped semantic signals, and Model CommandInput/group/list layout.

- [ ] Keep trigger rules unchanged; remove only dropdown visual noise.
- [ ] Agent: remove halo/rail/card-like selected styling; keep descriptions readable as one Command row.
- [ ] Permission: replace full danger/safe row tint with neutral selection plus semantic icon/check/label colors.
- [ ] Model: remove imported font, inner input card, and repeated group borders; retain 280px scroll viewport and sticky headers.
- [ ] Run `npm test -- --runInBand tests/unit/features/chat/ChatAgentSelectionCoordinator.test.ts tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts tests/unit/features/chat/claudePermissionModeSelector.test.ts tests/unit/features/chat/codexSandboxModeSelector.test.ts tests/unit/infrastructure/model-popover-viewport-render.test.mjs`.

### Task 3: Build, deploy, and judge the real plugin surface

**Files:**
- Modify: generated `styles.css`
- Modify: `docs/modules/style/components/agent-selector.md`
- Modify: `docs/modules/style/components/permission-mode-selector.md`
- Modify: `docs/modules/style/components/model-selector.md`

- [ ] Run `npm run build`, copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` sequentially to the Test Vault plugin directory, and verify the deployed `BUILD_ID`.
- [ ] Reload the plugin and capture separately named Agent, Permission, and Model cards in light and dark themes; verify the screenshot filename matches its opened card.
- [ ] Confirm Agent/Permission/Model Scope Escape focus restoration; capture Model `aria-activedescendant` while open, its 280px viewport before close, sticky headers, and narrow 8px insets.
- [ ] Run `npm run graphify:update:src`, then `OWNER_GUARD_APPROVED='Approved Composer permission-card rollback requires the existing OpenCodianView-owned OpenCode service restart seam.' npm run verify`.
