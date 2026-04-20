# Autopilot Lane Map — OpenCode Session Message Alignment

> **Preset**: `Maintainability / Refactor`
> **Scheduling**: Sequential lane controller
> **Live plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md`
> **Note**: The active lane comes from `automation/autopilot-config.json`; this file indexes the lane queues.

## Lane Directories

- `m1-hotspot-slice` — session graph, send, and sync foundations
  - roadmap: `docs/status/lanes/m1-hotspot-slice/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/m1-hotspot-slice/autopilot-phase-0.md`
  - queued tasks: Task 1, Task 2, Task 3
- `m2-followup-slice` — stream, render, and command/plugin structured parts
  - roadmap: `docs/status/lanes/m2-followup-slice/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/m2-followup-slice/autopilot-phase-0.md`
  - queued tasks: Task 4, Task 5, Task 6
- `m3-checkpoint` — reload compensation and final verification checkpoint
  - roadmap: `docs/status/lanes/m3-checkpoint/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/m3-checkpoint/autopilot-phase-0.md`
  - queued tasks: Task 7

## Primary Reference Files

- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\app\src\context\global-sync\event-reducer.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\ui\src\components\session-turn.tsx`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\ui\src\components\message-part.tsx`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\session.ts`

## Boundaries

- The plan file is the implementation source of truth.
- Lane roadmaps are the autopilot scheduling source of truth.
- Historical `docs/status/maintainability-*.md` files must not be used to decide the next task for this run.
