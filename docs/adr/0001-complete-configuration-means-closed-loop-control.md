# ADR 0001 — Complete configuration means closed-loop control

- **Status**: Accepted
- **Date**: 2026-07-24
- **Supersedes**: the implicit "global resources are strictly read-only" invariant in `ProjectResourceSecureWrite`

## Context

The capability-exposure gap map (`docs/status/capability-exposure-gap-map-2026-07-23.md`)
showed that the felt problem was not a thin backend adapter layer, but that a
user could not tell — for any given setting — whether it was *actually* in
effect. A control can exist in the settings UI yet never reach the backend
request, or reach it without ever being confirmed by the backend. "Every
backend CRUD operation is exposed" (CRUD symmetry) was being treated as the
goal, but CRUD symmetry does not prove a setting is real: it only proves a
form field exists.

At the same time, the security boundary for writing configuration files
asserted that global roots (`~/.claude`, `~/.agents`, `~/.codex`) were strictly
read-only. That blocked the legitimate "configure everything from inside the
plugin" goal without offering a safe path forward.

## Decision

Adopt **closed-loop completeness** as the definition of "configured", and
separate it from both CRUD symmetry and capability navigation.

1. **A setting is completely configured only when proven on three axes** —
   persistence (stored in a source the plugin owns), application (wired into
   the backend request), and runtime readback (the backend confirms the
   effective value). See `CONTEXT.md` → Configuration Evidence / Configuration
   Loop. CRUD symmetry is demoted to a separate, weaker goal.

2. **Capability Navigation is a distinct concern** from completeness. It
   answers "where do I edit this for backend X?" and lives in the Capability
   Lab, not in every settings tab. Settings tabs use **Source Grouping**
   (by what a setting controls), not by originating file/backend.

3. **Global configuration roots become writable through an explicit
   allowlisted-root contract**, replacing the blanket read-only invariant. The
   `PathConfinement` shared owner (reused by `assertWithinRoot`,
   `resolveCanonicalTargetWithinRoot`, and `ConfigurationArchiveService.confinedPath`)
   remains the single guard
   against symlink/path-traversal escapes; allowlist membership is the only
   thing that authorizes a global root to be written. This unblocks in-plugin
   configuration of global sources without weakening the security chokepoint.

4. **Honest evidence over optimistic echoes.** Runtime evidence is captured
   defensively from backend responses (`thread/start`, `thread/resume`, …).
   Fields the server did not confirm are `unavailable`, never fabricated from
   request-side values. A setting whose runtime axis is `unavailable` is
   reported as such, not as "working".

## Consequences

- **Positive:** "Is this setting real?" becomes answerable per-axis instead of
  by guessing. The security boundary gains a safe path to global-root writes
  instead of an absolute block. UI copy can be honest about what is verified
  vs unavailable.
- **Negative:** Completeness is stricter than CRUD parity, so some "exposed"
  controls will correctly surface as incomplete until their runtime readback
  is wired. More discipline is required when adding settings: each must close
  its own loop.
- **Migration:** the read-only global invariant is superseded; module docs and
  the secure-write owner were updated in the same change. No existing caller of
  `assertWithinRoot` / `atomicWriteFile` changed; the new contract is additive.

## References

- `CONTEXT.md` — glossary of canonical terms
- `src/core/agents/backend/ProjectResourceSecureWrite.ts` — allowlisted-root
  contract, `FileRevision`, `SafeFileMutationResult`, `ConfigurationEvidence`
- `docs/status/capability-exposure-gap-map-2026-07-23.md` — gap map this ADR
  resolves the framing of
