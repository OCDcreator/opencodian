# Archived maintainability history

This directory holds historical phase documentation, autopilot lane/master plans, and
one-time audit/checkpoint evidence from the **pre-Phase-6 maintainability program**.
It is **superseded** by the single active architecture roadmap:

- Active plan: `docs/superpowers/plans/2026-07-30-agent-friendly-architecture-and-governance-refactor.md`
- Current architecture overview: `docs/architecture/README.md`

> **Not in the default agent reading chain.** Agents are not instructed to read these
> hundreds of phase documents. Browse here only when you need specific historical
> evidence (e.g. why a thick-owner slice was scoped a certain way, or a past audit's
> findings). For current rules, read `docs/status/development-maintainability-rules.md`
> and `docs/requirements/agent-maintainability.md` instead.

## Why this archive exists

Before Phase 6 of the agent-friendly architecture refactor, the maintainability
program ran as an unattended autopilot that produced a numbered phase document per
round plus master/lane/round-roadmap control documents and one-time checkpoint/audit
evidence. That program is paused (`R162` checkpoint reached a high-maintainability
steady state) and its control documents must not run in parallel as a second
architecture roadmap. Task 19 retires them from the default reading chain while
keeping them searchable.

## Git history is preserved

Every file here was moved with `git mv`, so full history is preserved. Trace a file's
origin and edits with:

```bash
git log --follow -- docs/archive/maintainability/phases/maintainability-phase-1.md
```

The original path is documented per category below for cross-referencing older notes.

## Contents by category

### `phases/` — numbered phase docs + checkpoint/audit evidence (590 files)

- **Maintainability phases** (`maintainability-phase-1.md` … `maintainability-phase-497.md`)
  - Original path: `docs/status/maintainability-phase-N.md`
  - Per-round execution summaries from the unattended autopilot (rounds R1–R162 and
    their sub-slices). Phase 1 is the initial guardrail batch; later phases converge on
    the `R162` high-maintainability checkpoint.
- **Model-config maintainability phases** (`model-config-maintainability-phase-1.md` … `-6.md`)
  - Original path: `docs/status/model-config-maintainability-phase-N.md`
  - The model-config sub-program's per-phase evidence.
- **Checkpoint packs** (`checkpoint-*.md`)
  - Original path: `docs/status/checkpoint-NN*.md`
  - Dated one-time execution packs and audits (codex settings truth splits,
    websearchmode cached-vs-live, image-input seam, app-server surface mapping,
    persisted-session runtime proofs, etc.). Includes the `-execution-pack.md` and
    `-opencode-prompt.md` companions.
- **Audit / evaluation / alignment docs** (`*-audit-*.md`, `*-evaluation-*.md`,
  `*-alignment-*.md`)
  - Original path: `docs/status/…`
  - One-time historical audits (models-settings, opencode-agent-surface, opencodian
    mac/windows adaptation, opencode-session-alignment), alignment evaluations
    (askquestion-mechanism, session-lifecycle, task-subagent-lifecycle), and follow-up
    plans. These are point-in-time evidence, not current state.
- **Settings density visual-QA** (`settings-*-visual-qa-*.md`)
  - Original path: `docs/status/settings-*-visual-qa-*.md`
  - One-time density/hierarchy visual-QA captures from the 2026-05 settings unification
    lanes (formatter, mcp-server, model-availability, plugin-catalog, classic-catalog,
    layout foundation/visible-unification).
- **Session-lifecycle council review + Tier 5 inventory**
  - `session-lifecycle-council-review-2026-05-10.md`,
    `session-lifecycle-tier5-canonical-readpath-inventory-2026-05-10.md`
  - Original path: `docs/status/…`
  - Multi-LLM council consensus review and the Conversation.messages read-path audit
    that fed the session-lifecycle tier lanes.

### `autopilot/` — autopilot control / master / lane / round documents (13 files)

- `maintainability-master-plan.md` — **[PAUSED]** at `R162`. Was the autopilot strategy doc.
- `maintainability-round-roadmap.md` — **[PAUSED]** controlled-round queue (`R162` done, no further auto-task).
- `maintainability-lane-map.md`, `maintainability-completed-batches.md` — lane map + completed-batch ledger.
- `autopilot-master-plan.md`, `autopilot-lane-map.md` — generic autopilot control docs.
- `autopilot-agent-mcp-formatter-{master-plan,lane-map}.md`,
  `autopilot-sdk-permission-slash-{master-plan,lane-map}.md` — per-lane autopilot evidence.
- `model-config-maintainability-{master-plan,lane-map,round-roadmap}.md` — model-config sub-program control docs.

All original path: `docs/status/<filename>`.

## Searching the archive

```bash
# Find a phase by round id
rg -l 'R162' docs/archive/maintainability/

# Find a checkpoint by topic
rg -l 'websearchmode' docs/archive/maintainability/phases/
```
