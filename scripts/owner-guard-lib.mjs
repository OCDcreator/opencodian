import { execFileSync } from 'node:child_process';
import path from 'node:path';

import {
  autoDetectRange,
  normalizeRepoPath,
  parseArgs,
  repoRoot,
} from './module-doc-guard-lib.mjs';

const GUARD_TARGETS = [
  'src/features/chat/OpenCodianView.ts',
  'src/core/opencode/OpenCodeService.ts',
  'src/main.ts',
  'src/core/opencode/ServerManager.ts',
];

const AUTO_EXEMPT_PREFIXES = [
  'docs/',
  'tests/',
  'scripts/',
  'automation/',
  'src/style/',
  'assets/',
  'src/i18n/',
];

const AUTO_EXEMPT_EXACT = new Set(['styles.css']);

const NEVER_AUTO_EXEMPT_PATHS = new Set([
  'scripts/check-owner-guard.mjs',
  'scripts/install-hooks.mjs',
]);

const THIN_LAYER_HINT_PATTERN = /(Facade|Gateway|Builder|Provider|Adapter)\.tsx?$/;

const PRESENTATION_ONLY_LINE_PATTERNS = [
  /^\s*$/,
  /^\s*\/[/*]/,
  /^\s*\*/,
  /^\s*import\s+type\b/,
  /^\s*type\s+\w+/,
  /^\s*interface\s+\w+/,
  /^\s*(public|private|protected)?\s*readonly\s+\w+\??:\s*[^=;]+;?\s*$/,
  /className/,
  /\.addClass\(/,
  /\.removeClass\(/,
  /\.toggleClass\(/,
  /setAttribute\(\s*['"]class['"]/,
  /aria-/,
  /placeholder/i,
  /label/i,
  /title/i,
  /tooltip/i,
  /notice/i,
  /\bt\(/,
];

const OWNERSHIP_SIGNAL_PATTERNS = [
  /(public|private|protected)\s+[A-Za-z0-9_]+\s*=\s*new\s+(Map|Set|WeakMap|WeakSet)\b/,
  /(public|private|protected)\s+[A-Za-z0-9_]+\s*:\s*(Map|Set|WeakMap|WeakSet|Record)</,
  /\bsetTimeout\(/,
  /\bsetInterval\(/,
  /\brequestAnimationFrame\(/,
  /\.addEventListener\(/,
  /\.registerEvent\(/,
  /\.observe\(/,
  /\bon\(/,
  /\boff\(/,
  /\bsubscribe\(/,
  /new\s+(MutationObserver|ResizeObserver|IntersectionObserver)\b/,
  /\b(disposer|unsubscribe|subscription|listener|observer|retryLoop|poll|intervalId)\b/i,
  /\b(session|message|part|view|service).*(state|truth|status|cache|map|store)\b/i,
  /\b(active|current|pending).*(Map|Set|State|Status|Queue|Store|Cache)\b/,
];

export { parseArgs, repoRoot };

export function getGuardTargets() {
  return [...GUARD_TARGETS];
}

export function isGuardTarget(repoPath) {
  return GUARD_TARGETS.includes(normalizeRepoPath(repoPath));
}

export function isNeverAutoExemptPath(repoPath) {
  return NEVER_AUTO_EXEMPT_PATHS.has(normalizeRepoPath(repoPath));
}

export function isAutoExemptPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (isNeverAutoExemptPath(normalized)) {
    return false;
  }

  if (AUTO_EXEMPT_EXACT.has(normalized)) {
    return true;
  }

  return AUTO_EXEMPT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function detectMode(rawMode = process.env.OWNER_GUARD_MODE ?? 'normal') {
  return rawMode === 'maintainability-refactor'
    ? 'maintainability-refactor'
    : 'normal';
}

export function detectDiffRange(root, rawRange = process.env.OWNER_GUARD_DIFF_RANGE) {
  if (rawRange) {
    return rawRange;
  }

  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}...HEAD`;
  }

  if (!process.env.CI && !process.env.GITHUB_ACTIONS) {
    return 'HEAD';
  }

  return autoDetectRange(root);
}

export function readGitDiffNameOnly(root, range) {
  const output = execFileSync('git', ['diff', '--name-only', range], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((line) => normalizeRepoPath(line))
    .filter(Boolean);
}

export function readGitDiffNumstat(root, range) {
  const output = execFileSync('git', ['diff', '--numstat', range], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  if (!output) {
    return new Map();
  }

  return new Map(
    output.split(/\r?\n/).map((line) => {
      const [rawAdded, rawRemoved, filePath] = line.split(/\t/);
      return [
        normalizeRepoPath(filePath),
        {
          addedLineCount: rawAdded === '-' ? 0 : Number(rawAdded),
          removedLineCount: rawRemoved === '-' ? 0 : Number(rawRemoved),
        },
      ];
    }),
  );
}

export function readGitDiffPatch(root, range, repoPath) {
  return execFileSync('git', ['diff', '--unified=0', range, '--', repoPath], {
    cwd: root,
    encoding: 'utf8',
  });
}

export function extractChangedCodeLines(patchText) {
  const added = [];
  const removed = [];

  for (const line of patchText.split(/\r?\n/)) {
    if (
      !line
      || line.startsWith('diff --git')
      || line.startsWith('index ')
      || line.startsWith('@@')
      || line.startsWith('+++')
      || line.startsWith('---')
    ) {
      continue;
    }

    if (line.startsWith('+')) {
      added.push(line.slice(1));
      continue;
    }

    if (line.startsWith('-')) {
      removed.push(line.slice(1));
    }
  }

  return { added, removed };
}

export function isPresentationOnlyLine(line) {
  return PRESENTATION_ONLY_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

export function hasOwnershipSignal(line) {
  return OWNERSHIP_SIGNAL_PATTERNS.some((pattern) => pattern.test(line));
}

export function buildFileAssessment(repoPath, patchText, numstat = {}) {
  const normalizedPath = normalizeRepoPath(repoPath);
  const { added, removed } = extractChangedCodeLines(patchText);
  const relevantLines = [...added, ...removed];
  const presentationOnly = relevantLines.length > 0 && relevantLines.every(isPresentationOnlyLine);
  const addedOwnershipSignalCount = added.filter(hasOwnershipSignal).length;
  const netNewOwnership = addedOwnershipSignalCount > 0 && !presentationOnly;

  return {
    repoPath: normalizedPath,
    presentationOnly,
    netNewOwnership,
    addedOwnershipSignalCount,
    addedLineCount: numstat.addedLineCount ?? added.length,
    removedLineCount: numstat.removedLineCount ?? removed.length,
  };
}

export function buildGuardTargetAssessments(root, range, changedPaths) {
  const numstatMap = readGitDiffNumstat(root, range);
  const assessments = {};

  for (const repoPath of changedPaths) {
    if (!isGuardTarget(repoPath)) {
      continue;
    }

    const patchText = readGitDiffPatch(root, range, repoPath);
    assessments[repoPath] = buildFileAssessment(repoPath, patchText, numstatMap.get(repoPath));
  }

  return assessments;
}

export function collectThinLayerHints(changedPaths) {
  return changedPaths
    .map((repoPath) => normalizeRepoPath(repoPath))
    .filter((repoPath) => THIN_LAYER_HINT_PATTERN.test(path.posix.basename(repoPath)));
}

export function evaluateOwnerGuard({
  mode = 'normal',
  changedPaths = [],
  fileAssessments = {},
  thinLayerHints = [],
} = {}) {
  const normalizedPaths = [...new Set(changedPaths.map((repoPath) => normalizeRepoPath(repoPath)))];
  const guardTouches = normalizedPaths.filter(isGuardTarget);
  const nonExemptTouches = normalizedPaths.filter((repoPath) => !isAutoExemptPath(repoPath));

  if (normalizedPaths.length === 0) {
    return {
      ok: true,
      className: 'ClassA',
      ruleId: null,
      reasons: ['No changed paths detected.'],
      thinLayerHints,
    };
  }

  if (nonExemptTouches.length === 0) {
    return {
      ok: true,
      className: 'ClassA',
      ruleId: null,
      reasons: ['Only auto-exempt paths changed.'],
      thinLayerHints,
    };
  }

  const guardAssessments = guardTouches.map((repoPath) => ({
    repoPath,
    ...fileAssessments[repoPath],
  }));

  if (guardAssessments.some((assessment) => assessment.netNewOwnership)) {
    const offenders = guardAssessments
      .filter((assessment) => assessment.netNewOwnership)
      .map((assessment) => assessment.repoPath);
    return {
      ok: false,
      className: 'ClassB',
      ruleId: 'RULE_3_NET_NEW_OWNERSHIP',
      touchedFiles: offenders,
      reasons: ['Guarded thick-owner file grew net-new runtime ownership.'],
      thinLayerHints,
    };
  }

  const isMaintainabilityRefactor = mode === 'maintainability-refactor';
  const allGuardTouchesArePresentationOnly = guardAssessments.length > 0
    && guardAssessments.every((assessment) => assessment.presentationOnly);
  const allGuardTouchesNetReduce = guardAssessments.length > 0
    && guardAssessments.every(
      (assessment) => (assessment.removedLineCount ?? 0) > (assessment.addedLineCount ?? 0),
    );

  if (allGuardTouchesArePresentationOnly) {
    return {
      ok: true,
      className: 'ClassA',
      ruleId: null,
      reasons: ['Guarded file edits are presentation-only.'],
      thinLayerHints,
    };
  }

  if (isMaintainabilityRefactor && allGuardTouchesNetReduce) {
    return {
      ok: true,
      className: 'ClassA',
      ruleId: null,
      reasons: ['Explicit maintainability refactor net-reduces guarded ownership.'],
      thinLayerHints,
    };
  }

  if (guardTouches.length > 0) {
    return {
      ok: false,
      className: 'ClassB',
      ruleId: 'RULE_1_HOTSPOT_CLASS_B',
      touchedFiles: guardTouches,
      reasons: ['A guarded thick-owner file was modified by a Class B change.'],
      thinLayerHints,
    };
  }

  return {
    ok: true,
    className: 'ClassB',
    ruleId: null,
    reasons: ['Non-guarded implementation files changed; no owner-guard blocker fired.'],
    thinLayerHints,
  };
}

export function formatOwnerGuardResult(result, { range, mode } = {}) {
  const header = result.ok ? 'PASS owner-guard' : 'FAIL owner-guard';
  const details = [
    `mode: ${mode ?? 'normal'}`,
    range ? `range: ${range}` : null,
    result.className ? `class: ${result.className}` : null,
    result.ruleId ? `rule: ${result.ruleId}` : null,
  ].filter(Boolean);

  const lines = [header, ...details];

  if (result.touchedFiles?.length) {
    lines.push(`files: ${result.touchedFiles.join(', ')}`);
  }

  if (result.reasons?.length) {
    lines.push(...result.reasons.map((reason) => `- ${reason}`));
  }

  if (result.thinLayerHints?.length) {
    lines.push(
      `- review hint: thin-layer style filenames touched (${result.thinLayerHints.join(', ')})`,
    );
  }

  if (!result.ok) {
    lines.push(
      '- guidance: move the behavior into an existing adjacent owner, or follow the maintainability baseline/module docs before growing a guarded shell.',
    );
  }

  return `${lines.join('\n')}\n`;
}
