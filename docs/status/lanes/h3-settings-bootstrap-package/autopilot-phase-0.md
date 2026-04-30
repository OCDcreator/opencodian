# Autopilot Phase 0 — `h3-settings-bootstrap-package`

## Mission

Package the settings and bootstrap shell hotspots so the repository does not merely move ownership pressure from chat/service into `OpenCodianSettings.ts`, `main.ts`, and related settings presenters.

## Baseline Hotspot Evidence

- `src/features/settings/OpenCodianSettings.ts`
  - `96` touches in the last 120 days
  - still the settings-shell bridge despite many section owners already existing
- `src/main.ts`
  - about `1546` lines
  - `16` imports
  - `67` touches in the last 120 days
- `src/features/settings/SettingsModelCatalogPresenter.ts`
  - about `1362` lines
  - `7` imports
- Supporting docs:
  - `docs/modules/features/settings/OpenCodianSettings.md`
  - `docs/modules/features/settings/SettingsModelCatalogPresenter.md`
  - `docs/modules/entry-point/main.md`

## Success Signals

- `OpenCodianSettings.ts` loses a real cross-section bridge or shell-responsibility slice.
- `main.ts` startup/warmup/refresh orchestration becomes more focused without scattering plugin-level semantics.
- Settings presenter and section owners become easier to reason about with tests and module docs still aligned.

## Guardrails

- Do not re-bloat `OpenCodianSettings.ts` while packaging nearby work.
- Do not create a forest of tiny settings helper files.
- Keep startup order, settings normalization, and cross-view refresh semantics intact.

## Queue Entry

Start from `docs/status/lanes/h3-settings-bootstrap-package/autopilot-round-roadmap.md` and execute the first `[NEXT]` item only.
