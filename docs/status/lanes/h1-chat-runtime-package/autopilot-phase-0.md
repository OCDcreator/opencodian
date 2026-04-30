# Autopilot Phase 0 — `h1-chat-runtime-package`

## Mission

Package the `OpenCodianView` hotspot into stronger adjacent chat runtime owners without regressing concurrent tab/session behavior, hydration/auth-sync sequencing, question/todo/background-task flows, or input/theme behavior.

## Baseline Hotspot Evidence

- Primary hotspot: `src/features/chat/OpenCodianView.ts`
  - about `5418` lines
  - `91` imports
  - `306` touches in the last 120 days
- Adjacent high-pressure owners and helpers:
  - `src/features/chat/services/ConversationRenderService.ts`
  - `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
  - `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts`
  - `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
  - `src/features/chat/services/ChatSelectionControlsCoordinator.ts`

## Success Signals

- `OpenCodianView.ts` loses a measurable slice of direct assembly responsibility.
- New ownership lives in existing or clearly durable adjacent chat owners, not in throwaway thin files.
- Targeted chat runtime tests and matching module docs stay green.
- The lane leaves enough written evidence for a later hotspot recomputation.

## Guardrails

- Do not collapse multi-tab runtime back into a single global streaming state.
- Do not move stable runtime ownership into `main.ts`.
- Do not create sub-100 line helper files just to satisfy line-count optics.
- Keep question/background-task/scroll restore behavior intact.

## Queue Entry

Start from `docs/status/lanes/h1-chat-runtime-package/autopilot-round-roadmap.md` and execute the first `[NEXT]` item only.
