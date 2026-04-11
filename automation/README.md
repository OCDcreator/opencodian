# Maintainability Autopilot

This folder contains a **无人值守** maintainability loop for this repo. `Codex` handles one round at a time; the preferred outer controller is now the cross-platform Python CLI in `automation/autopilot.py`. The older PowerShell scripts remain available as a Windows-first fallback.

## Files

- `automation/autopilot.py`: cross-platform unattended driver (`start`, `watch`, `status`, `doctor`)
- `automation/profiles/windows.json`: Windows profile overrides
- `automation/profiles/mac.json`: macOS profile overrides
- `automation/Start-MaintainabilityAutopilot.ps1`: legacy unattended driver kept as fallback
- `automation/Watch-MaintainabilityAutopilot.ps1`: legacy live watcher
- `automation/New-MaintainabilityWorktree.ps1`: one-time helper for a dedicated worktree
- `automation/maintainability-config.json`: repo-specific objective, commands, and stop limits
- `automation/round-prompt.md`: per-round prompt template
- `automation/round-result.schema.json`: structured final-response contract
- `automation/runtime/`: ignored runtime state, logs, prompts, and round results

## Why this is stable

- Every round uses `codex exec` in a **new non-interactive session**
- Loop control lives in a machine-readable outer controller, not in a recursive prompt
- State is machine-readable JSON, not checklist parsing
- Failed rounds hard-reset the worktree back to the round's starting `HEAD`
- Successful rounds must produce a phase doc, pass validation, and create a commit
- A runtime lock file prevents two machines from driving the same branch at once

## Safe bootstrap

Run unattended refactors in a dedicated branch/worktree, not on `main`.

```powershell
pwsh -File .\automation\New-MaintainabilityWorktree.ps1 `
  -WorktreePath ..\opencodian-autopilot `
  -Branch autopilot/maintainability

cd ..\opencodian-autopilot
```

## Preferred Python flow

The Python CLI is the main entrypoint for both Windows and macOS.

### Windows

```powershell
python .\automation\autopilot.py doctor --profile windows
python .\automation\autopilot.py start --profile windows
```

### macOS

```bash
python3 ./automation/autopilot.py doctor --profile mac
python3 ./automation/autopilot.py start --profile mac
```

Before using the macOS profile, update `automation/profiles/mac.json` so `test_vault_plugin_dir` points at the actual Test Vault plugin directory on that Mac.

### Helpful Python commands

```powershell
python .\automation\autopilot.py status
python .\automation\autopilot.py watch
python .\automation\autopilot.py start --profile windows --dry-run --single-round
python .\automation\autopilot.py start --profile windows --single-round
```

The Python driver prints live milestones such as:

- session started
- turn started / completed
- every shell command Codex runs
- short agent status messages
- stderr warnings

It also writes `automation/runtime/autopilot.lock.json` while running. Do not run the same autopilot branch on two machines at the same time unless you explicitly understand and override the lock.

## PowerShell fallback

If you want to keep using the older Windows flow, these commands still work:

```powershell
pwsh -File .\automation\Start-MaintainabilityAutopilot.ps1
```

What each round does:

1. Reads `AGENTS.md` and the last maintainability phase doc
2. Chooses exactly one small maintainability slice
3. Refactors the code
4. Runs `npm test`
5. Runs `npm run build` + Test Vault deployment when build-relevant files changed
6. Writes the next `docs/status/maintainability-phase-N.md`
7. Commits the round on success
8. Updates `automation/runtime/maintainability-state.json`

## Resume after interruption

Run the same command again:

```powershell
python .\automation\autopilot.py start --profile windows
```

The driver resumes from `automation/runtime/maintainability-state.json`. If you switch machines, sync both the git branch and the `automation/runtime/` state files before resuming.

## Watch live progress

In another terminal, tail the newest round:

```powershell
python .\automation\autopilot.py watch
```

Useful files per round:

- `automation/runtime/round-XXX/progress.log`: human-readable live timeline
- `automation/runtime/round-XXX/events.jsonl`: raw `codex exec --json` events
- `automation/runtime/round-XXX/assistant-output.json`: final structured result
- `automation/runtime/maintainability-state.json`: current loop state
- `automation/runtime/autopilot.lock.json`: active-machine lock metadata

## Helpful modes

Dry-run the next prompt only:

```powershell
python .\automation\autopilot.py start --profile windows --dry-run --single-round
```

Run exactly one unattended round:

```powershell
python .\automation\autopilot.py start --profile windows --single-round
```

## Stop conditions

The loop stops automatically when any of these happens:

- `max_rounds` reached
- `max_consecutive_failures` reached
- agent returns `goal_complete`
- branch/worktree safety guard fails

## Current default focus

The committed config starts from `docs/status/maintainability-phase-7.md` and points phase 8 toward:

- splitting `createSendPipelineRuntimeHost()` into narrower host ports
- extracting assistant shell / notice rendering ownership from `OpenCodianView`
