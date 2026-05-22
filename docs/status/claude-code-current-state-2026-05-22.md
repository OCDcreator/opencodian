# Claude Code SDK Current State - 2026-05-22

## Purpose

This document is the current continuity handoff for future models continuing the Claude Code SDK lane in OpenCodian.

Use this file to answer:

- where the Claude backend lane currently is;
- which capabilities are complete versus only wired;
- which surfaces are intentionally still diagnostic or hidden;
- which older status documents are now partially outdated.

This is a status snapshot, not the long-term design or full implementation plan.

## Current Anchor

- Worktree: `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability`
- Snapshot commit: `9adc44da3e778b99bde2130e8fdfcb7b4d1fda63`
- Commit subject: `feat: prove claude capability lab runtime slices`
- Latest validated build at this snapshot: `feature-phase0-capability.202605221644`

## Source Of Truth Order

Read these in order when continuing Claude work:

1. `docs/requirements/multi-agent-foundation/04-claude-code-adapter.md`
2. `docs/superpowers/specs/2026-05-20-claude-code-full-capability-design.md`
3. `docs/superpowers/plans/2026-05-20-claude-code-full-capability-implementation.md`
4. `src/core/agents/backend/ClaudeCodeAdapter.ts`
5. `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
6. `src/features/settings/SettingsCapabilityLabSection.ts`
7. This file

Interpret older `docs/status/claude-code-*.md` files as historical snapshots unless they are explicitly newer than this file.

## Where The Project Is Now

The Claude Code lane is no longer at proposal stage.

The current position is:

- Phase 0 backend-neutral groundwork is sufficiently complete for real Claude backend work.
- Phase 1 minimal backend loop is complete.
- Phase 2 has meaningful implementation, not just design.
- A subset of later-phase Claude-native ecosystem capabilities has already been wired behind diagnostic or hidden surfaces.

The most important framing for future work:

- OpenCodian is not trying to flatten Claude into an OpenCode-shaped backend.
- OpenCodian is trying to preserve a multi-backend shell while still letting each backend eventually expose its native ecosystem.
- For Claude, advanced capabilities are being integrated with a diagnostic-first policy before stable promotion.

## What Is Definitely Complete

These items are implemented enough to treat as real delivered backend capability, not speculative design:

| Area | Current state |
|---|---|
| Backend registration and routing | Claude is a real backend in the multi-backend architecture, not a placeholder. |
| SDK import and executable handling | The adapter uses the official SDK path, plus process resolution and Electron-safe spawn handling. |
| Persistent query runtime | Claude owns a persistent `query()` runtime and can stream across turns. |
| Session identity | Claude uses backend-owned session identity via `backendSessionId`-style flow, rather than pretending to be OpenCode. |
| Resume | Claude session resume is wired and runtime-smoked. |
| Stream normalization | Text, thinking, tool use, tool result, usage, message metadata, hook events, subagent progress, and structured output backend events are normalized. |
| Permissions bridge | `canUseTool` and elicitation/question bridging are wired into the existing permission/question flows. |
| Model / effort / thinking basics | Core Claude settings and options mapping are implemented. |
| MCP runtime pass-through | MCP servers can be passed through and refreshed at runtime. |
| OpenCode coexistence | OpenCode remains alive as a backend and is not meant to be regressed by Claude work. |

## What Exists But Must Not Be Described As Stable Completion

These capabilities are no longer “not wired”, but they are also not stable completed product surfaces.

| Capability | Real state now | How to describe it |
|---|---|---|
| Structured output | Runtime-only `outputFormat` wiring exists, backend-event normalization exists, Capability Lab probe exists, runtime evidence exists. Transcript rendering and persistence are now stable. | `Diagnostic authoring`, stable transcript rendering. |
| Hooks | Runtime-only hook injection exists, hook events are normalized, SessionStart runtime proof exists in Capability Lab. | `Hidden` or `Diagnostic`, not authoring-complete. |
| Session store | Runtime-only SDK `sessionStore` path exists, plugin-owned diagnostic store adapter exists, import/mirror/list/load proof exists in Capability Lab. | `Diagnostic store proof only`, not stable storage product. |
| JSONL history browser | Capability Lab can browse history read-only and preview messages. | `Diagnostic browser`, not full history productization. |
| Rewind | Adapter-level `rewindFiles()` exists and dry-run surface exists. | Not stable-complete until no-data-loss guard and stronger runtime proof are accepted. |
| Agent definitions | Runtime-only `agent` / `agents` option wiring exists. | Must remain `Hidden / Untested`. |
| Skills / plugins / agent authoring | Some runtime-only channels exist or are planned, but no stable Claude-native authoring surface is complete in OpenCodian. | Not complete. |

## Current Capability-Layer Interpretation

Future models should use this language:

- `wired`: the SDK option or adapter seam exists.
- `runtime-proved`: there is local runtime evidence that the seam actually executes.
- `stable`: the capability is intentionally exposed as part of the product surface for end users.

For several Claude-native capabilities, OpenCodian is currently at:

- `wired + runtime-proved + not stable`

That is the correct reading for:

- hooks
- diagnostic session store

Structured output is now at `wired + runtime-proved + stable transcript rendering`, with authoring/triggering remaining diagnostic-only.

Do not collapse this to either:

- “not implemented”, or
- “fully complete”

Both would be wrong.

## Capability Lab Status

`src/features/settings/SettingsCapabilityLabSection.ts` is now an important state-owner for Claude parity work.

It currently serves as:

- a capability matrix;
- a read-only JSONL history browser;
- a diagnostic session-store mirror/import/list/load surface;
- a rewind dry-run preview surface;
- a structured-output runtime probe;
- a hook runtime proof surface.

Important policy:

- Capability Lab is allowed to do isolated diagnostic actions.
- Capability Lab is not allowed to claim stable completion of a feature by itself.
- Capability Lab must continue to distinguish `Settings`, `Diagnostic`, and `Hidden`.

## Older Status Docs That Are Now Partially Outdated

The following files contain useful history, but their per-capability status must not be treated as current:

- `docs/status/claude-code-backend-capabilities-2026-05-21.md`
- `docs/status/claude-code-phase1-smoke-status-2026-05-21.md`

Why they are partially outdated:

- they still describe hooks as “not wired”;
- they still describe session store as “not wired”;
- they still describe structured output as “not wired”;
- they predate the diagnostic runtime proof slices landed in commit `9adc44da`.

Keep them for history, but prefer current code plus this file for present-state judgments.

## Relationship To Claudian

`claudian` remains a useful reference project for:

- Claude-native settings productization;
- `.claude/settings.json` ownership;
- slash command, skills, agent, MCP, and plugin storage patterns;
- provider-owned history and rewind product surfaces.

But OpenCodian is not meant to become Claude-only.

The intended direction is:

- multi-backend shell;
- provider-owned native ecosystem surfaces where appropriate;
- capability-gated shared UI where semantics genuinely match.

Do not use `claudian` as evidence that Claude-specific semantics should be flattened into generic OpenCode-style settings.

## Current Evidence Artifacts

At the current snapshot, local runtime evidence exists under `.obsidian-debug/`, especially:

- `.obsidian-debug/capability-lab-testvault-final.png`
- `.obsidian-debug/capability-lab-final-console.txt`
- `.obsidian-debug/capability-lab-final-errors.txt`
- `.obsidian-debug/capability-lab-surface-assertion-final.txt`
- `.obsidian-debug/capability-lab-backend-runtime-result.json`

Treat those as local evidence for:

- deployed build identity;
- Test Vault reload success;
- Capability Lab surface presence;
- hook and structured-output backend-event activity in runtime logs.

Note: one backend runtime artifact timed out while trying to do too much in one long eval. That timeout does not erase the stronger direct console evidence for hook and structured-output event flow, but it does mean future models should prefer narrower runtime assertions per capability.

## The Best Short Summary For Future Models

If you need one sentence:

> OpenCodian's Claude Code SDK lane has passed Phase 1 backend viability, has meaningful Phase 2 wiring, and has begun Phase 3/4-style Claude-native capability integration through diagnostic-first surfaces, but several advanced capabilities are intentionally runtime-proved without yet being stable product features.

## Recommended Next-Step Mindset

When continuing this lane, choose one of these modes explicitly:

- promote a diagnostic Claude capability to stable UI;
- deepen runtime proof for a currently diagnostic capability;
- expand Claude-native ecosystem ownership, such as history, rewind, skills, agents, plugins, or MCP authoring;
- improve multi-backend abstraction so future backends can expose their own native ecosystems cleanly.

Do not mix these modes casually in one slice.

## Hard Guardrails

- Do not regress OpenCode while promoting Claude.
- Do not claim `Agent Definitions` complete unless both official basis and runtime product proof justify it.
- Do not mark hooks, session store, structured output, or rewind as stable merely because the adapter seam exists.
- Do not remove legacy compatibility fields that older OpenCode conversations still rely on without an explicit migration plan.
- Do not flatten Claude-native semantics into generic settings when the design docs say they are backend-specific.
