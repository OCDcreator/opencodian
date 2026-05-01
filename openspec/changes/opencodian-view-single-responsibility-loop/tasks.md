# Tasks

## 1. Pipeline Setup

- [ ] 1.1 Validate current graphify/module-doc state and identify the safest current `OpenCodianView.ts` source seams.
- [ ] 1.2 Generate a Task Master layer for this `OpenCodianView.ts` single-responsibility loop.
- [ ] 1.3 Import and enrich an execute queue with blocking review, targeted acceptance checks, and long-run status tracking.

## 2. First Source Slice

- [ ] 2.1 Move one complete `OpenCodianView.ts` debug/diagnostics or render-support slice into an existing adjacent owner, or into one durable owner if no existing owner can own the behavior.
- [ ] 2.2 Add focused tests for the moved behavior where applicable.
- [ ] 2.3 Update matching module docs, refresh graphify, and pass `npm run verify`.

## 3. Second Source Slice

- [ ] 3.1 Move one complete child-session tree, context-usage, tooltip/copy, assistant render, or user-message support slice out of `OpenCodianView.ts` by extending the matching existing owner.
- [ ] 3.2 Add focused tests for the moved behavior where applicable.
- [ ] 3.3 Update matching module docs, refresh graphify, and pass `npm run verify`.

## 4. Third Source Slice

- [ ] 4.1 Move one complete activation/sync/question/todo/background-task host assembly slice only if it reduces callback surface without adding a thin bridge chain.
- [ ] 4.2 Add focused tests for the moved behavior where applicable.
- [ ] 4.3 Update matching module docs, refresh graphify, and pass `npm run verify`.

## 5. Continuation Status

- [ ] 5.1 Update `docs/status/lanes/t5-opencodian-view-single-responsibility/autopilot-status.md` after every task with round, current task, last commit, verification, and next focus.
- [ ] 5.2 If the queue reaches the end without a blocker, record the next safe queue seed rather than declaring the whole `OpenCodianView.ts` problem solved.
