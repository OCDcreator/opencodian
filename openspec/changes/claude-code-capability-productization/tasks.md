# Tasks

## 1. Resume and Checkpoint Boundaries

- [ ] 1.1 Verify authenticated ordinary resume positive proof remains reproducible.
- [ ] 1.2 Audit `resume-at` / checkpoint controls and keep them gated unless a real positive flow can be proven.
- [ ] 1.3 Add focused tests and docs for any promoted or newly gated path.

## 2. Permission, Question, and MCP User Paths

- [ ] 2.1 Map the current diagnostic permission/question/MCP proof to ordinary chat surfaces.
- [ ] 2.2 Implement the smallest stable path that can be proven end to end, or tighten diagnostic labels if no stable path is safe.
- [ ] 2.3 Prove with focused tests and fresh Obsidian/Test Vault artifacts.

## 3. SDK Option Honesty

- [ ] 3.1 Reconcile Capability Lab, settings UI, and SDK option wiring for advanced toggles.
- [ ] 3.2 Hide/gate/diagnostic-label unproven toggles and add negative full-capability claim checks.

## 4. History, Structured Output, Hooks, and Session Store

- [ ] 4.1 Audit product boundaries for JSONL, structured output, hooks, and sessionStore.
- [ ] 4.2 Productize only one narrow verifiable path or leave it diagnostic with explicit evidence.

## 5. Claude Ecosystem Surfaces

- [ ] 5.1 Audit subagent transcript/progress, skills/plugins discovery, and agent definitions authoring.
- [ ] 5.2 Implement one read-only or honesty-hardening slice with tests and docs.

## 6. OpenCode Regression and Stable Controls

- [ ] 6.1 Verify Claude does not inherit OpenCode-only rewind/revert/diff controls.
- [ ] 6.2 Keep OpenCode behavior green with focused routing tests and required gates.

## 7. Completion Discipline

- [ ] 7.1 Update status docs, module docs, devlog, graphify, and runtime artifacts after each implementation slice.
- [ ] 7.2 Do not close the queue as full capability complete unless all ledger rows have real E2E proof or external-blocker evidence.
