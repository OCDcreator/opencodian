# Maintenance-Phase Development Baseline

> Updated: 2026-04-28
>
> This document defines the project-wide development baseline for the current maintenance-first phase. OpenCodian is not accepting general net-new feature development during this phase. The default goal of each change is to improve engineering structure, reinforce single responsibility, and reduce unsafe ownership.

## Current Phase

OpenCodian is currently in a maintenance-first phase:

1. Preserve runtime behavior unless a stability fix is required.
2. Improve ownership clarity, architecture safety, and verification quality.
3. Reduce duplicate state, duplicate orchestration, and accidental cross-domain coupling.
4. Defer general new feature work until the maintainability target is met.

During this phase, a green `npm run verify` is necessary but not sufficient. A change is only considered successful when it also improves or preserves the intended ownership shape.

## What This Baseline Adopts

The large-project guidance that informed this baseline is directionally useful, but it must be adapted to this repository's current architecture instead of being copied literally.

The project adopts these principles:

- Treat OpenCodian as a large single-repo plugin codebase, not a small plugin.
- Optimize for domain ownership and safe edit surfaces, not line-count minimalism.
- Allow high-connection facade owners to remain large when they are acting as stable shells.
- Prefer one cohesive 350-line owner over four 90-line files with blurred boundaries.
- Use graph structure, module docs, and verification gates to guide maintainability work.
- Prevent thin helper proliferation that only moves complexity sideways.

## What This Baseline Explicitly Rejects

The following ideas should not become hard project rules for this repository:

- Do not force a one-community-to-one-directory mapping from graphify communities. Communities are diagnostic signals, not directory prescriptions.
- Do not reorganize the repo into a generic `core/services`, `core/views`, `shared/hooks`, or similar template structure unless a concrete migration plan proves clear value.
- Do not use file line count as the primary definition of modularity.
- Do not require minimum file-length thresholds as a hard gate. Small files are acceptable when they represent a real owner, boundary adapter, barrel, or type surface.
- Do not introduce a global event bus merely because the project is large. Shared coordination must be justified by current runtime needs, not architecture fashion.
- Do not rely on region comments as a substitute for ownership design. They are optional navigation aids, not architecture.

## Canonical Structure Rule

The current repository structure is the baseline:

- `src/core/`: low-level runtime, OpenCode integration, storage, config, theme, security.
- `src/features/`: domain-oriented feature surfaces such as chat and settings.
- `src/shared/`: cross-domain helpers with stable reuse.
- `src/utils/`: implementation utilities that support rendering, icons, glass, markdown, and similar technical concerns.
- `docs/modules/**`: file-level ownership contract.

Maintainability work should improve this structure in place before proposing broad directory churn. Large-scale path reshuffles are allowed only when they clearly reduce ownership ambiguity and can be verified incrementally.

## Owner-First Development Rule

Every change must begin by identifying the owner being modified:

- high-connection facade owner
- domain runtime owner
- domain UI owner
- state owner
- config owner
- storage owner
- test owner
- documentation owner

If the owner cannot be named clearly, the change is not ready.

When multiple files are involved, one file or tightly related owner group should still be the center of responsibility. Avoid changes that spread behavior across several domains without a clear primary home.

## Thick Owners Policy

Some files are unavoidable complexity centers. In this repository, the main examples are:

- `src/features/chat/OpenCodianView.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/main.ts`
- `src/core/opencode/ServerManager.ts`

These files may remain large, but only under these conditions:

- they act as shells, facades, or lifecycle composition owners
- they do not accumulate new runtime ownership that belongs elsewhere, including long-lived truth, orchestration, callback coordination, or stream/session lifecycle responsibility
- extracted modules own complete behavior slices, not trivial forwarding wrappers
- the import and coordination surface trends down over time, not up

The goal is not to force these files below an arbitrary number. The goal is to make them safer to understand and change.

For `src/features/chat/OpenCodianView.ts` and `src/core/opencode/OpenCodeService.ts`, the stricter active guardrail still applies: do not add new runtime ownership when touching them. Maintenance work should reduce or at least preserve their current ownership envelope, not reinterpret "shell" as permission to keep adding more coordination responsibility.

Inside thick owners, use clear internal sections, named helper blocks, or region-style comments where helpful, but only after ownership is already coherent.

## Single-Responsibility Rule

A module satisfies single responsibility in this repository when:

- it owns one behavior slice that can be described in one sentence
- its consumers can use it without understanding unrelated internals
- changing its internals does not force unrelated domains to change
- its tests and docs point to the same responsibility boundary

Create a new module only when at least one of these is true:

- the new module owns a complete behavior slice
- the logic is reused in three or more places
- the extraction isolates a high-risk dependency or protocol boundary
- the extraction removes duplicate truth or duplicate orchestration and leaves behind a durable owner instead of a one-off forwarding helper

Do not extract modules merely to reduce line count, satisfy aesthetic symmetry, or create nominal layering.

## File Size Guidance

File size is guidance, not a hard architecture target. Use these bands as review signals:

| Owner type | Preferred band | Review threshold | Notes |
| --- | --- | --- | --- |
| high-connection facade or view shell | no strict target | review any meaningful growth when already thick; review above 1000 for new or substantially rewritten owners | acceptable when ownership stays shell-like and the ownership envelope is not expanding |
| domain service / coordinator / runtime owner | 200-500 lines | review above 600 | prefer cohesive owners over fragmented helpers |
| utility / mapper / serializer | 40-250 lines | review above 400 | extract only if a real sub-owner appears |
| tests | 200-800 lines | review above 1000 | cohesive scenario coverage is more important than small test files |
| types / schema / barrel surfaces | unrestricted | review for cohesion, not size | keep by domain when possible |

Crossing a review threshold does not mean "must split now." It means the change should pause and justify why the current owner is still the right home. For existing thick legacy owners, direction of travel matters more than the absolute line count.

## Anti-Fragmentation Rule

Fragmentation is a first-class failure mode in this codebase.

Warning signs include:

- a new helper file that is only called once
- parallel `adapter`, `factory`, `provider`, or `bridge` layers that do not reduce risk
- extracting logic but leaving the original owner with the same conceptual burden
- several tiny files that must always be read together to understand one behavior

A change fails the maintainability bar if it moves complexity sideways without reducing:

- ownership ambiguity
- import surface
- duplicate state
- verification uncertainty
- test responsibility spread

## Domain Boundary Rule

Domain boundaries matter more than technical-category purity.

- Prefer changes within the existing domain owner before introducing new cross-domain callbacks.
- Avoid new direct `features/* -> features/*` dependencies unless the dependency is already the intentional owner boundary.
- When a cross-domain dependency is necessary, route it through an existing stable owner in `core/`, `shared/`, or the established adjacent runtime owner instead of inventing a broad new abstraction.
- Treat graphify communities as a prompt to inspect boundaries, not as a mandatory directory refactor plan.

This repository should become more domain-coherent over time, but it should not be forced into a generic large-app folder template that ignores the current Obsidian plugin runtime shape.

## Canonical Truth Rule

Maintainability work must continue reducing parallel truth paths.

Current canonical rules include:

- OpenCode canonical `session/message/part` truth belongs in `src/core/opencode/OpenCodeSessionStateStore.ts`.
- `OpenCodeService.ts` should remain a facade and compatibility boundary, not a second ad-hoc state store.
- `OpenCodianView.ts` should remain a view shell and composition surface, not a new runtime truth owner.
- `Conversation.messages` remains a compatibility/render cache output, not the primary runtime truth source.

Any change that reintroduces duplicated truth must be treated as a regression even if tests still pass.

## Allowed Work During This Phase

The default allowed work types are:

- reducing ownership in thick runtime owners
- consolidating duplicated orchestration or duplicated state
- strengthening single-responsibility boundaries
- fixing architecture-damaging bugs
- improving tests around risky ownership boundaries
- improving graphify freshness, module-doc coverage, and verification reliability
- clarifying docs that help future maintenance work land safely

The default disallowed work types are:

- general net-new end-user features
- broad stylistic rewrites without ownership payoff
- mass directory churn for cosmetic consistency
- abstraction-first rewrites that are not tied to a concrete current pain point

Feature work may still happen when it is required to unblock stability, compatibility, or maintainability, but it should be framed and reviewed as an exception.

## Verification Baseline

For source changes, the default verification gate remains:

```bash
npm run verify
```

Focused checks remain mandatory where relevant:

- `npm run check:module-docs`
- `npm run check:graphify`
- `npm run check:devlog-order`
- focused Jest targets for changed runtime owners

Docs-only maintenance can use narrower checks, but maintainability claims must still be supported by the relevant evidence.

## Review Questions

Before merging, ask:

1. Did this change reduce or at least preserve ownership clarity?
2. Did it avoid growing `OpenCodianView.ts` or `OpenCodeService.ts` ownership?
3. Did it remove duplication, or merely relocate it?
4. Did it keep the boundary aligned with existing domain owners?
5. Did it avoid thin helper fragmentation?
6. Did the verification evidence match the scope of the change?

If the answer to any of these is "no" or "unclear," the change should pause for redesign or a narrower maintenance queue.

## Relationship To Other Docs

- `AGENTS.md`: first-stop operational rules and hot paths
- `graphify-out/GRAPH_REPORT.md`: graph-level structure and cognitive-load hotspots
- `docs/modules/**`: per-file ownership contract
- `docs/status/development-maintainability-rules.md`: active day-to-day guardrail checklist
- `docs/requirements/agent-maintainability.md`: durable maintainability rationale for agent work

This document is the project-level baseline for the current maintenance phase. The status guardrail document stays shorter and more operational; this document explains the deeper architectural bar that maintenance work must satisfy.
