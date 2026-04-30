# Autopilot Lane Map — Hotspot Core Packaging

> **Preset**: `Maintainability / Refactor`
> **Scheduling**: Sequential lane controller
> **Live queue source**: lane-local roadmaps indexed below
> **Note**: Historical `docs/status/maintainability-*.md` files are background context only. The active lane always comes from `automation/autopilot-config.json` plus the lane roadmap below.

## Lane Directories

- `h1-chat-runtime-package` — package `OpenCodianView` and adjacent chat runtime owners
  - roadmap: `docs/status/lanes/h1-chat-runtime-package/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/h1-chat-runtime-package/autopilot-phase-0.md`
  - queued tasks: 3
- `h2-opencode-runtime-package` — package `OpenCodeService`, `ServerManager`, and adjacent runtime owners
  - roadmap: `docs/status/lanes/h2-opencode-runtime-package/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/h2-opencode-runtime-package/autopilot-phase-0.md`
  - queued tasks: 3
- `h3-settings-bootstrap-package` — package `OpenCodianSettings`, `main.ts`, and settings-shell hotspots
  - roadmap: `docs/status/lanes/h3-settings-bootstrap-package/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/h3-settings-bootstrap-package/autopilot-phase-0.md`
  - queued tasks: 3
- `h4-checkpoint` — recompute hotspot metrics, close residual seams, and stop only on a clean checkpoint
  - roadmap: `docs/status/lanes/h4-checkpoint/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/h4-checkpoint/autopilot-phase-0.md`
  - queued tasks: 2

## Primary Reference Files

- `graphify-out/GRAPH_REPORT.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/ServerManager.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/features/settings/SettingsModelCatalogPresenter.md`
- `docs/modules/entry-point/main.md`

## Boundaries

- Lane roadmaps are the autopilot scheduling source of truth.
- Historical `docs/status/maintainability-*.md` files must not be used to decide the next task for this run.
- Each round must shrink a real hotspot boundary, not just move code sideways.
- Every round must finish with Codex plan review plus Codex code review recorded in the phase doc.
