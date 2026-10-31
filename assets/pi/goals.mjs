// Adapter for @narumitw/pi-goal 0.54.x: public commands and branch-local state.
// No extension code is copied, installed, or enabled by this bridge.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function goalCommand(session) {
  const commands = session.extensionRunner?.getRegisteredCommands?.() ?? [];
  for (const command of commands) {
    if (command.name !== 'goal') continue;
    const info = command.sourceInfo;
    for (const candidate of [info?.path, info?.baseDir].filter((value) => typeof value === 'string')) {
      let directory = dirname(candidate);
      for (let depth = 0; depth < 5; depth++) {
        try {
          const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
          if (metadata.name === '@narumitw/pi-goal' && /^0\.54\./.test(metadata.version)) return command;
        } catch { /* Source paths may sit below the package root. */ }
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
    }
  }
  return null;
}

export function readPiGoal(session) {
  if (!goalCommand(session)) return { available: false, reason: 'A compatible @narumitw/pi-goal 0.54.x extension is not loaded', goal: null };
  const entries = session.sessionManager.getBranch().filter((item) => item.type === 'custom' && item.customType === 'goal-state');
  let entry = entries.at(-1);
  if (!entry) return { available: true, goal: null };
  if (!entry.data || !Object.hasOwn(entry.data, 'goal')) throw new Error('Malformed pi-goal state entry');
  // 0.54.x persists complete then immediately null when releasing its active
  // slot. Keep that native terminal record until a later clear or new Goal.
  if (entry.data.goal === null && entries.at(-2)?.data?.goal?.status === 'complete') entry = entries.at(-2);
  const goal = entry.data.goal;
  if (goal === null) return { available: true, goal: null };
  if (typeof goal?.id !== 'string' || typeof goal.text !== 'string' || typeof goal.status !== 'string')
    throw new Error('Incompatible pi-goal persisted state');
  if (entry.data.queue !== undefined || entry.data.pendingAction !== undefined)
    throw new Error('Legacy pi-goal queue state requires migration in the extension');
  return { available: true, goal: { id: goal.id, objective: goal.text, status: goal.waiting ? 'waiting' : goal.status,
    tokensUsed: goal.tokensUsed, tokenBudget: goal.tokenBudget ?? null, timeUsedSeconds: goal.timeUsedSeconds,
    automaticResponses: goal.automaticModelTurns, rounds: goal.iteration, updatedAt: goal.updatedAt,
    ...(goal.safetyPauseCause ? { reason: goal.safetyPauseCause } : {}),
  } };
}

function objectiveArgument(objective) {
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 4000) throw new Error('Invalid pi-goal objective');
  // The published tokenizer has no escape syntax. Preserve the condition or
  // fail before mutation, instead of silently removing quote characters.
  const delimiter = !objective.includes('"') ? '"' : !objective.includes("'") ? "'" : null;
  if (!delimiter) throw new Error('This pi-goal version cannot preserve objectives containing both quote styles');
  return `${delimiter}${objective}${delimiter}`;
}

export async function controlPiGoal(session, command) {
  const before = readPiGoal(session);
  if (!before.available) throw new Error(before.reason);
  if (command.expectedId && command.expectedId !== before.goal?.id) throw new Error('The pi-goal objective changed; refresh first');
  const action = command.action;
  const argumentsText = action === 'set' || action === 'edit'
    ? `${action === 'edit' ? 'edit ' : ''}${command.tokenBudget !== undefined ? `--tokens ${command.tokenBudget} ` : ''}${objectiveArgument(command.objective)}`
    : ['pause', 'resume', 'clear'].includes(action) ? action : null;
  if (argumentsText === null) throw new Error('Unsupported pi-goal action');
  if (command.tokenBudget !== undefined && (!Number.isSafeInteger(command.tokenBudget) || command.tokenBudget <= 0))
    throw new Error('pi-goal requires a positive integer token budget');
  const registered = goalCommand(session);
  await session.prompt(`/${registered.invocationName ?? registered.name} ${argumentsText}`, { source: 'rpc' });
  return readPiGoal(session);
}
