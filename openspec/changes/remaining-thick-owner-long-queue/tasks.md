# Tasks

## 1. Pipeline Setup

- [ ] 1.1 Archive stale historical `.opencode-loop` state instead of resuming it blindly.
- [ ] 1.2 Build a new Task Master layer for the current remaining thick-owner batch.
- [ ] 1.3 Import a new execute queue with a blocking Codex review gate and long-run status contract.

## 2. `main.ts` Startup Bootstrap Slice

- [ ] 2.1 Identify one durable startup bootstrap owner adjacent to `main.ts`.
- [ ] 2.2 Move startup bootstrap sequencing into that owner without removing plugin lifecycle ownership from `main.ts`.
- [ ] 2.3 Run targeted tests, update module docs, refresh graphify, and pass `npm run verify`.

## 3. `main.ts` Settings Runtime Slice

- [ ] 3.1 Identify one durable settings runtime owner adjacent to `main.ts`.
- [ ] 3.2 Move service update / rollback / persistence / refresh / config-sync choreography into that owner without fragmenting it.
- [ ] 3.3 Run targeted tests, update module docs, refresh graphify, and pass `npm run verify`.

## 4. `OpenCodeService.ts` Lifecycle Slice

- [ ] 4.1 Move the project-compaction reload lifecycle seam into the existing lifecycle owner if that move stays cohesive.
- [ ] 4.2 Keep `OpenCodeService.ts` as facade/compatibility shell and avoid inventing a thin new helper.
- [ ] 4.3 Run targeted tests, update module docs, refresh graphify, and pass `npm run verify`.

## 5. Checkpoint

- [ ] 5.1 Record the new checkpoint, last commit, next focus, and remaining thick-owner order.
- [ ] 5.2 State explicitly whether `OpenCodianView.ts` has a safe next unattended slice or should stay paused for the next batch.
