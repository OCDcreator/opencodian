# OpenCode SDK 1.17 Capability Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade OpenCodian to `@opencode-ai/sdk@1.17.17` and add a full SDK 1.17 capability/probe registry surfaced only in Capability Lab, with Obsidian Plugin Autodebug runtime proof.

**Architecture:** Keep the existing `OpenCodeSdkFacade` and legacy fallback boundaries intact. Add a focused OpenCode capability registry plus a probe runner under `src/core/opencode/`, expose it through `OpenCodeService`, and render the results in `SettingsCapabilityLabSection` as diagnostic-only UI.

**Tech Stack:** TypeScript, Jest, Obsidian plugin APIs, `@opencode-ai/sdk@1.17.17`, existing OpenCodian settings/Capability Lab UI, Obsidian Plugin Autodebug CLI/CDP workflow.

## Global Constraints

- Work in `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian`.
- Preserve all existing user/worktree changes. Do not revert unrelated dirty files.
- Do not edit `reference-projects/` except to refresh/read the upstream OpenCode source if needed.
- Keep existing SDK v2 + legacy HTTP/SSE fallback behavior intact.
- Do not remove legacy fallbacks unless a focused runtime proof shows they are impossible or obsolete and the change is explicitly documented.
- Do not expose experimental/new v2 capabilities to ordinary users outside Capability Lab in this phase.
- For state-changing SDK APIs, use read-only/presence/shape probes, dry-run-safe calls, or mark skipped with a precise safety reason.
- Do not create/delete user projects, worktrees, credentials, sessions, or PTYs just to prove an endpoint exists.
- Follow repo docs/module-doc/graphify rules from `AGENTS.md`.
- A probe may only be marked `pass` when there is runtime evidence from Obsidian/Test Vault, not just TypeScript compilation.
- Use `obsidian-plugin-autodebug` before claiming done.

---

## File Structure

- Modify `package.json` and `package-lock.json` to pin/install `@opencode-ai/sdk@1.17.17`.
- Modify `src/core/opencode/sdkTypes.ts` to import available SDK 1.17 type aliases from `@opencode-ai/sdk/v2/client` and `@opencode-ai/sdk/v2/types`.
- Modify `src/core/opencode/OpenCodeSdkFacade.ts` only if the upgraded SDK exposes namespaces that the current namespace list or proxy tests do not cover.
- Create `src/core/opencode/OpenCodeSdkCapabilityRegistry.ts` for registry types and the exhaustive static capability list.
- Create `src/core/opencode/OpenCodeSdkCapabilityProbeRunner.ts` for safe presence/readback/shape probes.
- Modify `src/core/opencode/OpenCodeService.ts` to expose `getSdkCapabilityRegistry()` and `runSdkCapabilityProbes()`.
- Modify `src/features/settings/SettingsCapabilityLabSection.ts` to add a diagnostic-only OpenCode SDK 1.17 capability probe block.
- Modify `src/i18n/locales/en.ts` and `src/i18n/locales/zh.ts` for Capability Lab labels.
- Add `tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts`.
- Add `tests/unit/core/opencode/OpenCodeSdkCapabilityProbeRunner.test.ts`.
- Update `tests/unit/core/opencode/createSdkClient.test.ts`.
- Update `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts`.
- Update `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts`.
- Create `docs/modules/core/opencode/OpenCodeSdkCapabilityRegistry.md`.
- Create `docs/modules/core/opencode/OpenCodeSdkCapabilityProbeRunner.md`.
- Update `docs/modules/core/opencode/OpenCodeSdkFacade.md`.
- Update `docs/modules/core/opencode/OpenCodeService.md`.
- Update `docs/modules/core/opencode/sdkTypes.md`.
- Update `docs/modules/features/settings/SettingsCapabilityLabSection.md`.
- Update `docs/status/sdk-v2-rollout.md`.
- Run `npm run graphify:update:src` if any `src/` file changes.

---

### Task 1: Upgrade SDK Package And Rebaseline SDK Boundary Tests

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/core/opencode/sdkTypes.ts`
- Modify: `tests/unit/core/opencode/createSdkClient.test.ts`
- Modify: `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts`

**Interfaces:**
- Consumes: current `createSdkClient(options: CreateSdkClientOptions): SdkOpencodeClient`.
- Produces: SDK 1.17 installed dependency and tests proving the facade still exposes `experimental` and `v2` namespace roots.

- [ ] **Step 1: Install the exact SDK version**

Run:

```bash
npm install @opencode-ai/sdk@1.17.17
```

Expected:

```text
package.json and package-lock.json reference @opencode-ai/sdk 1.17.17
```

- [ ] **Step 2: Verify the installed package version**

Run:

```bash
npm ls @opencode-ai/sdk --depth=0
```

Expected:

```text
opencodian@1.0.0 ...
└── @opencode-ai/sdk@1.17.17
```

- [ ] **Step 3: Extend the SDK facade test mock with SDK 1.17 roots**

In `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts`, update the `client` object in `createFacade()` so it includes these nested SDK 1.17 roots:

```typescript
experimental: {
  capabilities: { get: jest.fn().mockResolvedValue({ data: { enabled: [] } }) },
  controlPlane: { moveSession: jest.fn().mockResolvedValue({ data: { ok: true } }) },
  projectCopy: { generateName: jest.fn().mockResolvedValue({ data: { name: 'copy' } }) },
  resource: { list: jest.fn().mockResolvedValue({ data: {} }) },
  session: {
    background: jest.fn().mockResolvedValue({ data: [] }),
    list: jest.fn().mockResolvedValue({ data: [] }),
  },
},
v2: {
  health: { get: jest.fn().mockResolvedValue({ data: { ok: true } }) },
  location: { get: jest.fn().mockResolvedValue({ data: { directory: '/vault' } }) },
  agent: { list: jest.fn().mockResolvedValue({ data: [] }) },
  session: { active: jest.fn().mockResolvedValue({ data: [] }), list: jest.fn().mockResolvedValue({ data: [] }) },
  model: { list: jest.fn().mockResolvedValue({ data: [] }) },
  provider: { list: jest.fn().mockResolvedValue({ data: [] }) },
  integration: { list: jest.fn().mockResolvedValue({ data: [] }) },
  credential: { update: jest.fn().mockResolvedValue({ data: { ok: true } }) },
  permission: {
    request: { list: jest.fn().mockResolvedValue({ data: [] }) },
    saved: { list: jest.fn().mockResolvedValue({ data: [] }) },
  },
  question: { request: { list: jest.fn().mockResolvedValue({ data: [] }) } },
  fs: { list: jest.fn().mockResolvedValue({ data: [] }), find: jest.fn().mockResolvedValue({ data: [] }) },
  command: { list: jest.fn().mockResolvedValue({ data: [] }) },
  skill: { list: jest.fn().mockResolvedValue({ data: [] }) },
  reference: { list: jest.fn().mockResolvedValue({ data: [] }) },
  event: { subscribe: jest.fn().mockResolvedValue({ stream: (async function* () {})() }) },
  pty: { list: jest.fn().mockResolvedValue({ data: [] }) },
  projectCopy: { create: jest.fn().mockResolvedValue({ data: { ok: true } }) },
},
```

- [ ] **Step 4: Add SDK 1.17 namespace unwrap assertions**

Add this test to `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts`:

```typescript
it('unwraps SDK 1.17 experimental and v2 namespace responses', async () => {
  const { facade } = createFacade();

  await expect(facade.experimental.capabilities.get()).resolves.toEqual({ enabled: [] });
  await expect(facade.v2.health.get()).resolves.toEqual({ ok: true });
  await expect(facade.v2.session.active()).resolves.toEqual([]);
  await expect(facade.v2.permission.request.list()).resolves.toEqual([]);
  await expect(facade.v2.question.request.list()).resolves.toEqual([]);
});
```

- [ ] **Step 5: Keep `createSdkClient` config shape test exact**

In `tests/unit/core/opencode/createSdkClient.test.ts`, keep the existing assertion for:

```typescript
expect(mockCreateOpencodeClient).toHaveBeenCalledWith(expect.objectContaining({
  baseUrl: 'http://127.0.0.1:4096',
  directory: 'C:/vault',
  experimental_workspaceID: 'workspace-1',
  headers: {
    Authorization: 'Bearer token',
  },
  fetch: fetchImpl,
  responseStyle: 'data',
  throwOnError: true,
}));
```

If SDK 1.17 rejects any field at runtime or typecheck time, update `src/core/opencode/createSdkClient.ts` with the smallest compatibility change and keep the test aligned with the new source-of-truth shape.

- [ ] **Step 6: Run boundary tests**

Run:

```bash
npm test -- tests/unit/core/opencode/createSdkClient.test.ts tests/unit/core/opencode/OpenCodeSdkFacade.test.ts
```

Expected:

```text
Test Suites: 2 passed, 2 total
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/core/opencode/sdkTypes.ts tests/unit/core/opencode/createSdkClient.test.ts tests/unit/core/opencode/OpenCodeSdkFacade.test.ts
git commit -m "Upgrade OpenCode SDK boundary"
```

---

### Task 2: Add The OpenCode SDK Capability Registry

**Files:**
- Create: `src/core/opencode/OpenCodeSdkCapabilityRegistry.ts`
- Test: `tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts`

**Interfaces:**
- Consumes: no runtime services.
- Produces:
  - `OpenCodeSdkCapabilityRegistryEntry`
  - `OpenCodeSdkCapabilityProbeKind`
  - `OpenCodeSdkCapabilityProbeStatus`
  - `OPENCODE_SDK_117_CAPABILITY_REGISTRY`
  - `getOpenCodeSdkCapabilityRegistry()`

- [ ] **Step 1: Write the failing registry test**

Create `tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts`:

```typescript
import {
  getOpenCodeSdkCapabilityRegistry,
  OPENCODE_SDK_117_CAPABILITY_REGISTRY,
} from '../../../../src/core/opencode/OpenCodeSdkCapabilityRegistry';

describe('OpenCodeSdkCapabilityRegistry', () => {
  it('contains the full SDK 1.17 capability scope with stable ids', () => {
    const ids = OPENCODE_SDK_117_CAPABILITY_REGISTRY.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'experimental.capabilities.get',
      'experimental.controlPlane.moveSession',
      'experimental.projectCopy.generateName',
      'experimental.session.background',
      'v2.health.get',
      'v2.location.get',
      'v2.agent.list',
      'v2.session.active',
      'v2.session.list',
      'v2.model.list',
      'v2.provider.list',
      'v2.integration.list',
      'v2.credential.update',
      'v2.permission.request.list',
      'v2.permission.saved.list',
      'v2.question.request.list',
      'v2.fs.list',
      'v2.fs.find',
      'v2.command.list',
      'v2.skill.list',
      'v2.reference.list',
      'v2.event.subscribe',
      'v2.pty.list',
      'v2.projectCopy.create',
    ]));
  });

  it('marks state-changing capabilities as skipped instead of runnable', () => {
    const registry = getOpenCodeSdkCapabilityRegistry();
    const stateChangingIds = [
      'experimental.controlPlane.moveSession',
      'v2.credential.update',
      'v2.pty.create',
      'v2.projectCopy.create',
      'v2.projectCopy.remove',
      'v2.projectCopy.refresh',
    ];

    for (const id of stateChangingIds) {
      const entry = registry.find((candidate) => candidate.id === id);
      expect(entry).toBeDefined();
      expect(entry?.probeKind).toBe('skipped');
      expect(entry?.safety).toBe('state-changing');
      expect(entry?.skipReason).toMatch(/safe/i);
    }
  });

  it('returns a readonly copy of the registry', () => {
    const registry = getOpenCodeSdkCapabilityRegistry();

    expect(registry).not.toBe(OPENCODE_SDK_117_CAPABILITY_REGISTRY);
    expect(registry.map((entry) => entry.id)).toEqual(
      OPENCODE_SDK_117_CAPABILITY_REGISTRY.map((entry) => entry.id),
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts
```

Expected:

```text
Cannot find module '../../../../src/core/opencode/OpenCodeSdkCapabilityRegistry'
```

- [ ] **Step 3: Create the registry implementation**

Create `src/core/opencode/OpenCodeSdkCapabilityRegistry.ts`:

```typescript
export type OpenCodeSdkCapabilityProbeKind =
  | 'presence'
  | 'readback'
  | 'shape'
  | 'sse-presence'
  | 'skipped';

export type OpenCodeSdkCapabilityProbeStatus =
  | 'untested'
  | 'pass'
  | 'fail'
  | 'missing'
  | 'skipped';

export type OpenCodeSdkCapabilityCategory =
  | 'experimental'
  | 'v2-core'
  | 'v2-session'
  | 'v2-catalog'
  | 'v2-permission-question'
  | 'v2-files'
  | 'v2-runtime'
  | 'v2-project';

export type OpenCodeSdkCapabilitySafety =
  | 'read-only'
  | 'stream-abort'
  | 'requires-fixture'
  | 'state-changing';

export interface OpenCodeSdkCapabilityRegistryEntry {
  readonly id: string;
  readonly category: OpenCodeSdkCapabilityCategory;
  readonly sdkNamespace: string;
  readonly method: string;
  readonly sdkPath: readonly string[];
  readonly probeKind: OpenCodeSdkCapabilityProbeKind;
  readonly safety: OpenCodeSdkCapabilitySafety;
  readonly futureFeatureGate: string;
  readonly description: string;
  readonly expectedKeys?: readonly string[];
  readonly callArgs?: readonly unknown[];
  readonly skipReason?: string;
}

function readOnlyEntry(
  id: string,
  category: OpenCodeSdkCapabilityCategory,
  sdkNamespace: string,
  method: string,
  description: string,
  expectedKeys: readonly string[] = [],
  callArgs: readonly unknown[] = [],
): OpenCodeSdkCapabilityRegistryEntry {
  return {
    id,
    category,
    sdkNamespace,
    method,
    sdkPath: [...sdkNamespace.split('.'), method],
    probeKind: expectedKeys.length > 0 ? 'shape' : 'readback',
    safety: 'read-only',
    futureFeatureGate: `opencode.${id}`,
    description,
    expectedKeys,
    callArgs,
  };
}

function skippedEntry(
  id: string,
  category: OpenCodeSdkCapabilityCategory,
  sdkNamespace: string,
  method: string,
  description: string,
): OpenCodeSdkCapabilityRegistryEntry {
  return {
    id,
    category,
    sdkNamespace,
    method,
    sdkPath: [...sdkNamespace.split('.'), method],
    probeKind: 'skipped',
    safety: 'state-changing',
    futureFeatureGate: `opencode.${id}`,
    description,
    skipReason: 'Skipped until a safe Test Vault fixture is explicitly defined.',
  };
}

export const OPENCODE_SDK_117_CAPABILITY_REGISTRY = [
  readOnlyEntry('experimental.capabilities.get', 'experimental', 'experimental.capabilities', 'get', 'Read server-advertised experimental capability flags.'),
  skippedEntry('experimental.controlPlane.moveSession', 'experimental', 'experimental.controlPlane', 'moveSession', 'Move sessions between projects or locations.'),
  readOnlyEntry('experimental.projectCopy.generateName', 'experimental', 'experimental.projectCopy', 'generateName', 'Generate a project copy name without mutating project data.'),
  readOnlyEntry('experimental.session.background', 'experimental', 'experimental.session', 'background', 'Read experimental background session state.'),
  readOnlyEntry('v2.health.get', 'v2-core', 'v2.health', 'get', 'Read v2 server health.'),
  readOnlyEntry('v2.location.get', 'v2-core', 'v2.location', 'get', 'Read current v2 location metadata.'),
  readOnlyEntry('v2.agent.list', 'v2-catalog', 'v2.agent', 'list', 'List v2 agents.'),
  readOnlyEntry('v2.session.active', 'v2-session', 'v2.session', 'active', 'List active foreground v2 sessions.'),
  readOnlyEntry('v2.session.list', 'v2-session', 'v2.session', 'list', 'List v2 sessions.'),
  readOnlyEntry('v2.session.context', 'v2-session', 'v2.session', 'context', 'Probe v2 session context method presence; requires a session fixture for readback.', [], []),
  readOnlyEntry('v2.session.messages', 'v2-session', 'v2.session', 'messages', 'Probe v2 session messages method presence; requires a session fixture for readback.', [], []),
  readOnlyEntry('v2.session.history', 'v2-session', 'v2.session', 'history', 'Probe v2 session history method presence; requires a session fixture for readback.', [], []),
  readOnlyEntry('v2.session.events', 'v2-session', 'v2.session', 'events', 'Probe v2 session events method presence; requires a session fixture for readback.', [], []),
  skippedEntry('v2.session.interrupt', 'v2-session', 'v2.session', 'interrupt', 'Interrupt a running v2 session.'),
  readOnlyEntry('v2.model.list', 'v2-catalog', 'v2.model', 'list', 'List v2 models.'),
  readOnlyEntry('v2.provider.list', 'v2-catalog', 'v2.provider', 'list', 'List v2 providers.'),
  readOnlyEntry('v2.integration.list', 'v2-catalog', 'v2.integration', 'list', 'List v2 integrations.'),
  skippedEntry('v2.credential.update', 'v2-catalog', 'v2.credential', 'update', 'Update a stored credential label.'),
  readOnlyEntry('v2.permission.request.list', 'v2-permission-question', 'v2.permission.request', 'list', 'List v2 location-level pending permission requests.'),
  readOnlyEntry('v2.permission.saved.list', 'v2-permission-question', 'v2.permission.saved', 'list', 'List v2 saved permissions.'),
  readOnlyEntry('v2.question.request.list', 'v2-permission-question', 'v2.question.request', 'list', 'List v2 location-level pending question requests.'),
  readOnlyEntry('v2.fs.list', 'v2-files', 'v2.fs', 'list', 'List files for the current location.'),
  readOnlyEntry('v2.fs.find', 'v2-files', 'v2.fs', 'find', 'Find files for the current location.'),
  readOnlyEntry('v2.command.list', 'v2-runtime', 'v2.command', 'list', 'List v2 commands.'),
  readOnlyEntry('v2.skill.list', 'v2-runtime', 'v2.skill', 'list', 'List v2 skills.'),
  readOnlyEntry('v2.reference.list', 'v2-runtime', 'v2.reference', 'list', 'List v2 references.'),
  {
    ...readOnlyEntry('v2.event.subscribe', 'v2-runtime', 'v2.event', 'subscribe', 'Subscribe to native v2 event payloads.'),
    probeKind: 'sse-presence',
    safety: 'stream-abort',
  },
  readOnlyEntry('v2.pty.list', 'v2-runtime', 'v2.pty', 'list', 'List v2 PTY sessions.'),
  skippedEntry('v2.pty.create', 'v2-runtime', 'v2.pty', 'create', 'Create a v2 PTY session.'),
  skippedEntry('v2.projectCopy.create', 'v2-project', 'v2.projectCopy', 'create', 'Create a v2 project copy.'),
  skippedEntry('v2.projectCopy.remove', 'v2-project', 'v2.projectCopy', 'remove', 'Remove a v2 project copy.'),
  skippedEntry('v2.projectCopy.refresh', 'v2-project', 'v2.projectCopy', 'refresh', 'Refresh a v2 project copy.'),
] satisfies readonly OpenCodeSdkCapabilityRegistryEntry[];

export function getOpenCodeSdkCapabilityRegistry(): OpenCodeSdkCapabilityRegistryEntry[] {
  return OPENCODE_SDK_117_CAPABILITY_REGISTRY.map((entry) => ({ ...entry }));
}
```

- [ ] **Step 4: Run the registry test**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts
```

Expected:

```text
Test Suites: 1 passed, 1 total
```

- [ ] **Step 5: Commit**

```bash
git add src/core/opencode/OpenCodeSdkCapabilityRegistry.ts tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts
git commit -m "Add OpenCode SDK capability registry"
```

---

### Task 3: Add The Safe Probe Runner

**Files:**
- Create: `src/core/opencode/OpenCodeSdkCapabilityProbeRunner.ts`
- Test: `tests/unit/core/opencode/OpenCodeSdkCapabilityProbeRunner.test.ts`

**Interfaces:**
- Consumes:
  - `OpenCodeSdkCapabilityRegistryEntry`
  - `OpenCodeSdkCapabilityProbeStatus`
  - an SDK facade-like root object.
- Produces:
  - `OpenCodeSdkCapabilityProbeResult`
  - `OpenCodeSdkCapabilityProbeSuiteResult`
  - `OpenCodeSdkCapabilityProbeRunner`

- [ ] **Step 1: Write failing probe runner tests**

Create `tests/unit/core/opencode/OpenCodeSdkCapabilityProbeRunner.test.ts`:

```typescript
import {
  type OpenCodeSdkCapabilityRegistryEntry,
} from '../../../../src/core/opencode/OpenCodeSdkCapabilityRegistry';
import {
  OpenCodeSdkCapabilityProbeRunner,
} from '../../../../src/core/opencode/OpenCodeSdkCapabilityProbeRunner';

const baseEntry: OpenCodeSdkCapabilityRegistryEntry = {
  id: 'v2.health.get',
  category: 'v2-core',
  sdkNamespace: 'v2.health',
  method: 'get',
  sdkPath: ['v2', 'health', 'get'],
  probeKind: 'readback',
  safety: 'read-only',
  futureFeatureGate: 'opencode.v2.health.get',
  description: 'Read v2 server health.',
};

describe('OpenCodeSdkCapabilityProbeRunner', () => {
  it('marks readback probes pass when the SDK method resolves', async () => {
    const sdk = {
      v2: {
        health: {
          get: jest.fn().mockResolvedValue({ ok: true, version: '1.17.17' }),
        },
      },
    };
    const runner = new OpenCodeSdkCapabilityProbeRunner(sdk, [baseEntry], () => 1234);

    const result = await runner.runAll();

    expect(result.summary).toEqual({ pass: 1, fail: 0, missing: 0, skipped: 0 });
    expect(result.results[0]).toMatchObject({
      id: 'v2.health.get',
      status: 'pass',
      futureFeatureGate: 'opencode.v2.health.get',
      lastCheckedAt: 1234,
    });
    expect(result.results[0]?.evidence?.summary).toContain('resolved');
  });

  it('marks missing when any namespace segment is absent', async () => {
    const runner = new OpenCodeSdkCapabilityProbeRunner({ v2: {} }, [baseEntry], () => 1);

    const result = await runner.runAll();

    expect(result.summary).toEqual({ pass: 0, fail: 0, missing: 1, skipped: 0 });
    expect(result.results[0]?.status).toBe('missing');
    expect(result.results[0]?.error).toContain('v2.health.get');
  });

  it('does not invoke state-changing skipped probes', async () => {
    const stateChanging = {
      ...baseEntry,
      id: 'v2.projectCopy.create',
      sdkNamespace: 'v2.projectCopy',
      method: 'create',
      sdkPath: ['v2', 'projectCopy', 'create'],
      probeKind: 'skipped',
      safety: 'state-changing',
      skipReason: 'Skipped until a safe Test Vault fixture is explicitly defined.',
    } satisfies OpenCodeSdkCapabilityRegistryEntry;
    const create = jest.fn().mockResolvedValue({ ok: true });
    const runner = new OpenCodeSdkCapabilityProbeRunner({
      v2: { projectCopy: { create } },
    }, [stateChanging], () => 1);

    const result = await runner.runAll();

    expect(create).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ pass: 0, fail: 0, missing: 0, skipped: 1 });
    expect(result.results[0]?.status).toBe('skipped');
  });

  it('marks failed probes with a concise error message', async () => {
    const runner = new OpenCodeSdkCapabilityProbeRunner({
      v2: {
        health: {
          get: jest.fn().mockRejectedValue(new Error('server unavailable')),
        },
      },
    }, [baseEntry], () => 1);

    const result = await runner.runAll();

    expect(result.summary).toEqual({ pass: 0, fail: 1, missing: 0, skipped: 0 });
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.error).toBe('server unavailable');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeSdkCapabilityProbeRunner.test.ts
```

Expected:

```text
Cannot find module '../../../../src/core/opencode/OpenCodeSdkCapabilityProbeRunner'
```

- [ ] **Step 3: Implement the probe runner**

Create `src/core/opencode/OpenCodeSdkCapabilityProbeRunner.ts`:

```typescript
import type {
  OpenCodeSdkCapabilityProbeStatus,
  OpenCodeSdkCapabilityRegistryEntry,
} from './OpenCodeSdkCapabilityRegistry';

type CallableProbe = (...args: unknown[]) => Promise<unknown>;

export interface OpenCodeSdkCapabilityProbeEvidence {
  readonly summary: string;
  readonly keys: readonly string[];
  readonly preview: string;
}

export interface OpenCodeSdkCapabilityProbeResult {
  readonly id: string;
  readonly category: string;
  readonly sdkNamespace: string;
  readonly method: string;
  readonly probeKind: string;
  readonly status: OpenCodeSdkCapabilityProbeStatus;
  readonly futureFeatureGate: string;
  readonly lastCheckedAt: number;
  readonly evidence?: OpenCodeSdkCapabilityProbeEvidence;
  readonly error?: string;
  readonly skipReason?: string;
}

export interface OpenCodeSdkCapabilityProbeSummary {
  readonly pass: number;
  readonly fail: number;
  readonly missing: number;
  readonly skipped: number;
}

export interface OpenCodeSdkCapabilityProbeSuiteResult {
  readonly generatedAt: number;
  readonly summary: OpenCodeSdkCapabilityProbeSummary;
  readonly results: readonly OpenCodeSdkCapabilityProbeResult[];
}

function readPath(root: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, root);
}

function isCallableProbe(value: unknown): value is CallableProbe {
  return typeof value === 'function';
}

function summarizeValue(value: unknown): OpenCodeSdkCapabilityProbeEvidence {
  if (Array.isArray(value)) {
    return {
      summary: `resolved array(${value.length})`,
      keys: [],
      preview: JSON.stringify(value.slice(0, 3)),
    };
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).slice(0, 20);
    return {
      summary: `resolved object(${keys.length} key(s))`,
      keys,
      preview: JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item).slice(0, 500),
    };
  }

  return {
    summary: `resolved ${typeof value}`,
    keys: [],
    preview: String(value),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarize(results: readonly OpenCodeSdkCapabilityProbeResult[]): OpenCodeSdkCapabilityProbeSummary {
  return results.reduce<OpenCodeSdkCapabilityProbeSummary>((summary, result) => ({
    pass: summary.pass + (result.status === 'pass' ? 1 : 0),
    fail: summary.fail + (result.status === 'fail' ? 1 : 0),
    missing: summary.missing + (result.status === 'missing' ? 1 : 0),
    skipped: summary.skipped + (result.status === 'skipped' ? 1 : 0),
  }), {
    pass: 0,
    fail: 0,
    missing: 0,
    skipped: 0,
  });
}

export class OpenCodeSdkCapabilityProbeRunner {
  constructor(
    private readonly sdkRoot: unknown,
    private readonly registry: readonly OpenCodeSdkCapabilityRegistryEntry[],
    private readonly now: () => number = Date.now,
  ) {}

  async runAll(): Promise<OpenCodeSdkCapabilityProbeSuiteResult> {
    const generatedAt = this.now();
    const results: OpenCodeSdkCapabilityProbeResult[] = [];

    for (const entry of this.registry) {
      results.push(await this.runOne(entry));
    }

    return {
      generatedAt,
      summary: summarize(results),
      results,
    };
  }

  private async runOne(entry: OpenCodeSdkCapabilityRegistryEntry): Promise<OpenCodeSdkCapabilityProbeResult> {
    const lastCheckedAt = this.now();
    const base = {
      id: entry.id,
      category: entry.category,
      sdkNamespace: entry.sdkNamespace,
      method: entry.method,
      probeKind: entry.probeKind,
      futureFeatureGate: entry.futureFeatureGate,
      lastCheckedAt,
    };

    if (entry.probeKind === 'skipped') {
      return {
        ...base,
        status: 'skipped',
        skipReason: entry.skipReason ?? 'Skipped by registry policy.',
      };
    }

    const callable = readPath(this.sdkRoot, entry.sdkPath);
    if (!isCallableProbe(callable)) {
      return {
        ...base,
        status: 'missing',
        error: `SDK method not found: ${entry.sdkPath.join('.')}`,
      };
    }

    try {
      const value = await callable(...(entry.callArgs ? [...entry.callArgs] : []));
      return {
        ...base,
        status: 'pass',
        evidence: summarizeValue(value),
      };
    } catch (error) {
      return {
        ...base,
        status: 'fail',
        error: errorMessage(error),
      };
    }
  }
}
```

- [ ] **Step 4: Run the probe runner test**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeSdkCapabilityProbeRunner.test.ts
```

Expected:

```text
Test Suites: 1 passed, 1 total
```

- [ ] **Step 5: Commit**

```bash
git add src/core/opencode/OpenCodeSdkCapabilityProbeRunner.ts tests/unit/core/opencode/OpenCodeSdkCapabilityProbeRunner.test.ts
git commit -m "Add OpenCode SDK capability probe runner"
```

---

### Task 4: Expose Capability Probes Through OpenCodeService

**Files:**
- Modify: `src/core/opencode/OpenCodeService.ts`
- Test: `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`

**Interfaces:**
- Consumes:
  - `getOpenCodeSdkCapabilityRegistry()`
  - `OpenCodeSdkCapabilityProbeRunner`
  - `OpenCodeSdkFacadeClient`
- Produces:
  - `getSdkCapabilityRegistry()`
  - `runSdkCapabilityProbes()`

- [ ] **Step 1: Add failing service-level test**

In `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`, add a test near the SDK facade compatibility tests:

```typescript
it('runs OpenCode SDK capability probes through the service facade', async () => {
  const service = createOpenCodeServiceWithSdkClient({
    experimental: {
      capabilities: { get: jest.fn().mockResolvedValue({ data: { enabled: ['v2'] } }) },
      controlPlane: { moveSession: jest.fn() },
      projectCopy: { generateName: jest.fn().mockResolvedValue({ data: { name: 'copy' } }) },
      session: { background: jest.fn().mockResolvedValue({ data: [] }) },
    },
    v2: {
      health: { get: jest.fn().mockResolvedValue({ data: { ok: true } }) },
      location: { get: jest.fn().mockResolvedValue({ data: { directory: '/vault' } }) },
      agent: { list: jest.fn().mockResolvedValue({ data: [] }) },
      session: {
        active: jest.fn().mockResolvedValue({ data: [] }),
        list: jest.fn().mockResolvedValue({ data: [] }),
        context: jest.fn().mockResolvedValue({ data: {} }),
        messages: jest.fn().mockResolvedValue({ data: [] }),
        history: jest.fn().mockResolvedValue({ data: [] }),
        events: jest.fn().mockResolvedValue({ data: [] }),
        interrupt: jest.fn(),
      },
      model: { list: jest.fn().mockResolvedValue({ data: [] }) },
      provider: { list: jest.fn().mockResolvedValue({ data: [] }) },
      integration: { list: jest.fn().mockResolvedValue({ data: [] }) },
      credential: { update: jest.fn() },
      permission: {
        request: { list: jest.fn().mockResolvedValue({ data: [] }) },
        saved: { list: jest.fn().mockResolvedValue({ data: [] }) },
      },
      question: { request: { list: jest.fn().mockResolvedValue({ data: [] }) } },
      fs: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        find: jest.fn().mockResolvedValue({ data: [] }),
      },
      command: { list: jest.fn().mockResolvedValue({ data: [] }) },
      skill: { list: jest.fn().mockResolvedValue({ data: [] }) },
      reference: { list: jest.fn().mockResolvedValue({ data: [] }) },
      event: { subscribe: jest.fn().mockResolvedValue({ stream: (async function* () {})() }) },
      pty: { list: jest.fn().mockResolvedValue({ data: [] }), create: jest.fn() },
      projectCopy: { create: jest.fn(), remove: jest.fn(), refresh: jest.fn() },
    },
  });

  const result = await service.runSdkCapabilityProbes();

  expect(result.results.some((entry) => entry.id === 'v2.health.get' && entry.status === 'pass')).toBe(true);
  expect(result.results.some((entry) => entry.id === 'v2.projectCopy.create' && entry.status === 'skipped')).toBe(true);
});
```

If `createOpenCodeServiceWithSdkClient` does not currently accept partial SDK clients cleanly, extend the existing test support helper in `tests/unit/core/opencode/OpenCodeService.sdkCompat.testSupport.ts` rather than building a second service factory.

- [ ] **Step 2: Run the service test and confirm it fails**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts
```

Expected:

```text
Property 'runSdkCapabilityProbes' does not exist
```

- [ ] **Step 3: Add service methods**

In `src/core/opencode/OpenCodeService.ts`, import the registry and runner:

```typescript
import {
  getOpenCodeSdkCapabilityRegistry,
  type OpenCodeSdkCapabilityRegistryEntry,
} from './OpenCodeSdkCapabilityRegistry';
import {
  OpenCodeSdkCapabilityProbeRunner,
  type OpenCodeSdkCapabilityProbeSuiteResult,
} from './OpenCodeSdkCapabilityProbeRunner';
```

Add public methods near the other diagnostic/service query methods:

```typescript
getSdkCapabilityRegistry(): OpenCodeSdkCapabilityRegistryEntry[] {
  return getOpenCodeSdkCapabilityRegistry();
}

async runSdkCapabilityProbes(): Promise<OpenCodeSdkCapabilityProbeSuiteResult> {
  const runner = new OpenCodeSdkCapabilityProbeRunner(
    this.sdk,
    getOpenCodeSdkCapabilityRegistry(),
  );
  return runner.runAll();
}
```

- [ ] **Step 4: Run service compatibility tests**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts
```

Expected:

```text
Test Suites: 1 passed, 1 total
```

- [ ] **Step 5: Commit**

```bash
git add src/core/opencode/OpenCodeService.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.testSupport.ts
git commit -m "Expose OpenCode SDK capability probes"
```

---

### Task 5: Render The Probe Matrix In Capability Lab

**Files:**
- Modify: `src/features/settings/SettingsCapabilityLabSection.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Test: `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts`

**Interfaces:**
- Consumes:
  - `plugin.openCodeService.getSdkCapabilityRegistry()`
  - `plugin.openCodeService.runSdkCapabilityProbes()`
- Produces: diagnostic-only Capability Lab block with `data-section-block="opencode-sdk-capabilities"` and `data-capability-id` rows.

- [ ] **Step 1: Add failing Capability Lab DOM test**

In `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts`, extend `createMockPlugin()` so the returned mock includes:

```typescript
openCodeService: {
  getSdkCapabilityRegistry: jest.fn().mockReturnValue([
    {
      id: 'v2.health.get',
      category: 'v2-core',
      sdkNamespace: 'v2.health',
      method: 'get',
      probeKind: 'readback',
      status: 'untested',
      futureFeatureGate: 'opencode.v2.health.get',
      description: 'Read v2 server health.',
    },
  ]),
  runSdkCapabilityProbes: jest.fn().mockResolvedValue({
    generatedAt: 1234,
    summary: { pass: 1, fail: 0, missing: 0, skipped: 0 },
    results: [
      {
        id: 'v2.health.get',
        category: 'v2-core',
        sdkNamespace: 'v2.health',
        method: 'get',
        probeKind: 'readback',
        status: 'pass',
        futureFeatureGate: 'opencode.v2.health.get',
        lastCheckedAt: 1234,
        evidence: {
          summary: 'resolved object(1 key(s))',
          keys: ['ok'],
          preview: '{"ok":true}',
        },
      },
    ],
  }),
},
```

Add this test:

```typescript
it('renders OpenCode SDK capability probes as diagnostic-only rows', async () => {
  const plugin = createMockPlugin();
  const containerEl = document.createElement('div');
  const section = new SettingsCapabilityLabSection({
    plugin,
    createSectionHeading: createHeadingStub(),
  });

  section.attachTabbed(containerEl, 'capability-lab');

  const blockEl = containerEl.querySelector('[data-section-block="opencode-sdk-capabilities"]');
  expect(blockEl).not.toBeNull();
  expect(blockEl?.getAttribute('data-diagnostic')).toBe('true');
  expect(blockEl?.textContent).toContain('OpenCode SDK 1.17 probes');
  expect(blockEl?.querySelector('[data-capability-id="v2.health.get"]')).not.toBeNull();

  const button = blockEl?.querySelector('button');
  expect(button).not.toBeNull();
  button?.dispatchEvent(new MouseEvent('click'));
  await flushUi();

  expect(plugin.openCodeService.runSdkCapabilityProbes).toHaveBeenCalledTimes(1);
  expect(blockEl?.textContent).toContain('pass');
  expect(blockEl?.textContent).toContain('resolved object');
});
```

- [ ] **Step 2: Run the Capability Lab test and confirm it fails**

Run:

```bash
npm test -- tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
```

Expected:

```text
Expected block [data-section-block="opencode-sdk-capabilities"] not to be null
```

- [ ] **Step 3: Add locale strings**

In `src/i18n/locales/en.ts`, add keys near existing `settings.capabilityLab.*` keys:

```typescript
'settings.capabilityLab.openCodeSdk117.title': 'OpenCode SDK 1.17 probes',
'settings.capabilityLab.openCodeSdk117.description': 'Diagnostic-only probes for newly exposed OpenCode SDK/server capabilities. These results feed future feature gates but do not enable ordinary Chat or Settings features yet.',
'settings.capabilityLab.openCodeSdk117.run': 'Run probes',
'settings.capabilityLab.openCodeSdk117.running': 'Running probes...',
'settings.capabilityLab.openCodeSdk117.summary': 'Pass: {{pass}} · Fail: {{fail}} · Missing: {{missing}} · Skipped: {{skipped}}',
'settings.capabilityLab.openCodeSdk117.error': 'Probe run failed: {{error}}',
```

In `src/i18n/locales/zh.ts`, add matching keys:

```typescript
'settings.capabilityLab.openCodeSdk117.title': 'OpenCode SDK 1.17 探针',
'settings.capabilityLab.openCodeSdk117.description': '仅诊断使用的新 OpenCode SDK/server 能力探针。这些结果用于后续 feature gate，不会在本轮启用普通聊天或设置功能。',
'settings.capabilityLab.openCodeSdk117.run': '运行探针',
'settings.capabilityLab.openCodeSdk117.running': '正在运行探针...',
'settings.capabilityLab.openCodeSdk117.summary': '通过：{{pass}} · 失败：{{fail}} · 缺失：{{missing}} · 跳过：{{skipped}}',
'settings.capabilityLab.openCodeSdk117.error': '探针运行失败：{{error}}',
```

- [ ] **Step 4: Render the Capability Lab block**

In `src/features/settings/SettingsCapabilityLabSection.ts`, add a block after the existing capability matrix block in `attachTabbed()`:

```typescript
const openCodeSdkBlock = bodyEl.createDiv({
  cls: 'opencodian-settings-block',
  attr: {
    'data-section-block': 'opencode-sdk-capabilities',
    'data-diagnostic': 'true',
  },
});
this.renderOpenCodeSdkCapabilityProbes(openCodeSdkBlock);
```

Add this private method to the class:

```typescript
private renderOpenCodeSdkCapabilityProbes(containerEl: HTMLElement): void {
  containerEl.createEl('h4', { text: t('settings.capabilityLab.openCodeSdk117.title') });
  containerEl.createEl('p', {
    cls: 'opencodian-capability-lab-description',
    text: t('settings.capabilityLab.openCodeSdk117.description'),
  });

  const outputEl = containerEl.createDiv({ cls: 'opencodian-capability-lab-readback-output' });
  const registry = this.deps.plugin.openCodeService.getSdkCapabilityRegistry();
  this.renderOpenCodeSdkCapabilityRows(outputEl, registry.map((entry) => ({
    id: entry.id,
    category: entry.category,
    sdkNamespace: entry.sdkNamespace,
    method: entry.method,
    probeKind: entry.probeKind,
    status: 'untested',
    futureFeatureGate: entry.futureFeatureGate,
    lastCheckedAt: 0,
    skipReason: entry.skipReason,
  })));

  new Setting(containerEl)
    .setName(t('settings.capabilityLab.openCodeSdk117.title'))
    .setDesc(t('settings.capabilityLab.openCodeSdk117.description'))
    .addButton((button) => {
      button
        .setButtonText(t('settings.capabilityLab.openCodeSdk117.run'))
        .onClick(async () => {
          button.setButtonText(t('settings.capabilityLab.openCodeSdk117.running'));
          try {
            const result = await this.deps.plugin.openCodeService.runSdkCapabilityProbes();
            outputEl.empty();
            outputEl.createEl('p', {
              text: t('settings.capabilityLab.openCodeSdk117.summary', {
                pass: String(result.summary.pass),
                fail: String(result.summary.fail),
                missing: String(result.summary.missing),
                skipped: String(result.summary.skipped),
              }),
            });
            this.renderOpenCodeSdkCapabilityRows(outputEl, result.results);
          } catch (error) {
            outputEl.empty();
            outputEl.createEl('p', {
              cls: 'opencodian-capability-lab-error',
              text: t('settings.capabilityLab.openCodeSdk117.error', {
                error: error instanceof Error ? error.message : String(error),
              }),
            });
          } finally {
            button.setButtonText(t('settings.capabilityLab.openCodeSdk117.run'));
          }
        });
    });
}
```

Add the row renderer:

```typescript
private renderOpenCodeSdkCapabilityRows(
  containerEl: HTMLElement,
  rows: readonly Array<{
    readonly id: string;
    readonly category: string;
    readonly sdkNamespace: string;
    readonly method: string;
    readonly probeKind: string;
    readonly status: string;
    readonly futureFeatureGate: string;
    readonly lastCheckedAt: number;
    readonly evidence?: { readonly summary: string; readonly preview: string };
    readonly error?: string;
    readonly skipReason?: string;
  }>,
): void {
  for (const row of rows) {
    const rowEl = containerEl.createDiv({
      cls: 'opencodian-capability-lab-row',
      attr: {
        'data-capability-id': row.id,
        'data-probe-status': row.status,
      },
    });
    rowEl.createSpan({ cls: 'opencodian-capability-lab-row-label', text: row.id });
    rowEl.createSpan({ cls: 'opencodian-capability-lab-row-status', text: row.status });
    rowEl.createDiv({
      cls: 'opencodian-capability-lab-row-desc',
      text: `${row.category} · ${row.sdkNamespace}.${row.method} · ${row.probeKind} · ${row.futureFeatureGate}`,
    });
    const detail = row.evidence?.summary ?? row.error ?? row.skipReason;
    if (detail) {
      rowEl.createDiv({ cls: 'opencodian-capability-lab-row-evidence', text: detail });
    }
  }
}
```

If TypeScript reports `openCodeService` is missing from the test mock type only, update the mock return shape in the test. Do not weaken production types.

- [ ] **Step 5: Run Capability Lab tests**

Run:

```bash
npm test -- tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
```

Expected:

```text
Test Suites: 1 passed, 1 total
```

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/SettingsCapabilityLabSection.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
git commit -m "Render OpenCode SDK capability probes"
```

---

### Task 6: Update Module Docs And SDK Rollout Notes

**Files:**
- Create: `docs/modules/core/opencode/OpenCodeSdkCapabilityRegistry.md`
- Create: `docs/modules/core/opencode/OpenCodeSdkCapabilityProbeRunner.md`
- Modify: `docs/modules/core/opencode/OpenCodeSdkFacade.md`
- Modify: `docs/modules/core/opencode/OpenCodeService.md`
- Modify: `docs/modules/core/opencode/sdkTypes.md`
- Modify: `docs/modules/features/settings/SettingsCapabilityLabSection.md`
- Modify: `docs/status/sdk-v2-rollout.md`
- Modify: `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` if `npm run graphify:update:src` changes them.

**Interfaces:**
- Consumes: completed code from Tasks 1-5.
- Produces: module docs and status docs aligned with the new SDK 1.17 capability registry.

- [ ] **Step 1: Write module docs for the registry**

Create `docs/modules/core/opencode/OpenCodeSdkCapabilityRegistry.md`:

```markdown
# OpenCodeSdkCapabilityRegistry

`OpenCodeSdkCapabilityRegistry.ts` declares the diagnostic registry for OpenCode SDK 1.17 capability probes.

Responsibilities:

- define stable capability ids for SDK 1.17 surfaces;
- classify each capability by category, SDK namespace, method, probe kind, safety, and future feature gate;
- mark state-changing APIs as skipped until a safe Test Vault fixture exists;
- provide `getOpenCodeSdkCapabilityRegistry()` so callers receive a copy rather than mutating the registry constant.

It does not call the SDK, render UI, persist settings, or enable ordinary Chat/Settings features.
```

- [ ] **Step 2: Write module docs for the probe runner**

Create `docs/modules/core/opencode/OpenCodeSdkCapabilityProbeRunner.md`:

```markdown
# OpenCodeSdkCapabilityProbeRunner

`OpenCodeSdkCapabilityProbeRunner.ts` executes the OpenCode SDK capability registry against an SDK facade-like root object.

Responsibilities:

- resolve SDK methods from registry `sdkPath` values;
- run safe readback/shape/presence probes;
- skip state-changing capabilities without invoking them;
- normalize pass/fail/missing/skipped results into a serializable suite result for Capability Lab and Autodebug assertions.

It does not productize SDK features, create user resources, or bypass the registry safety policy.
```

- [ ] **Step 3: Update existing module docs**

Update these docs with one short section each:

```markdown
## SDK 1.17 Capability Probes

This module participates in the SDK 1.17 diagnostic probe path. The probe path is Capability Lab only; ordinary Chat and Settings flows must continue to use the established service/coordinator APIs until a later productization task promotes an individual feature gate.
```

Apply the section to:

- `docs/modules/core/opencode/OpenCodeSdkFacade.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/sdkTypes.md`
- `docs/modules/features/settings/SettingsCapabilityLabSection.md`

- [ ] **Step 4: Update rollout status**

Append a dated section to `docs/status/sdk-v2-rollout.md`:

```markdown
## 2026-07-09 — SDK 1.17 Capability Registry

- Upgraded the OpenCode SDK dependency target to `@opencode-ai/sdk@1.17.17`.
- Added a diagnostic-only SDK 1.17 capability registry and probe runner.
- Surfaced the registry in Capability Lab only; ordinary Chat/Settings flows do not consume the new feature gates yet.
- State-changing SDK methods are skipped until explicit safe Test Vault fixtures exist.
- Runtime acceptance requires Obsidian Plugin Autodebug evidence from the Test Vault.
```

- [ ] **Step 5: Refresh graphify if `src/` changed**

Run:

```bash
npm run graphify:update:src
```

Expected:

```text
graphify-out/ artifacts refresh without leaving src/graphify-out/ committed
```

- [ ] **Step 6: Run docs checks**

Run:

```bash
npm run check:module-docs
npm run check:graphify
```

Expected:

```text
both commands exit 0
```

- [ ] **Step 7: Commit**

```bash
git add docs/modules/core/opencode/OpenCodeSdkCapabilityRegistry.md docs/modules/core/opencode/OpenCodeSdkCapabilityProbeRunner.md docs/modules/core/opencode/OpenCodeSdkFacade.md docs/modules/core/opencode/OpenCodeService.md docs/modules/core/opencode/sdkTypes.md docs/modules/features/settings/SettingsCapabilityLabSection.md docs/status/sdk-v2-rollout.md graphify-out/GRAPH_REPORT.md graphify-out/graph.json
git commit -m "Document OpenCode SDK capability probes"
```

---

### Task 7: Run Full Local Verification

**Files:**
- No source edits expected unless verification exposes a defect from Tasks 1-6.

**Interfaces:**
- Consumes: completed implementation and docs.
- Produces: passing local verification before Test Vault runtime proof.

- [ ] **Step 1: Run focused SDK and Capability Lab tests**

Run:

```bash
npm test -- tests/unit/core/opencode/createSdkClient.test.ts tests/unit/core/opencode/OpenCodeSdkFacade.test.ts tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts tests/unit/core/opencode/OpenCodeSdkCapabilityProbeRunner.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
```

Expected:

```text
all listed suites pass
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected:

```text
command exits 0
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected:

```text
command exits 0 and writes dist/main.js, dist/manifest.json, dist/styles.css
```

- [ ] **Step 4: Run docs and graph gates**

Run:

```bash
npm run check:module-docs
npm run check:graphify
```

Expected:

```text
both commands exit 0
```

- [ ] **Step 5: Commit verification fixes only if needed**

If any verification command required a fix, inspect the exact changed paths and commit only the files changed to fix Task 7 verification. Use the concrete paths from `git status --short`, for example:

```bash
git status --short
git add src/core/opencode/OpenCodeSdkCapabilityProbeRunner.ts tests/unit/core/opencode/OpenCodeSdkCapabilityProbeRunner.test.ts
git commit -m "Fix OpenCode SDK capability verification"
```

If no fix was required, do not create a commit for this step.

---

### Task 8: Run Obsidian Plugin Autodebug Runtime Gate

**Files:**
- Runtime artifacts under `.obsidian-debug/` are expected and should not be committed unless explicitly requested.
- No source edits expected unless Autodebug exposes a defect.

**Interfaces:**
- Consumes: built `dist/` artifacts from Task 7.
- Produces: Test Vault runtime evidence proving the plugin reloads and Capability Lab probes run in Obsidian.

- [ ] **Step 1: Preflight Obsidian control**

Run:

```bash
obsidian help
```

Expected:

```text
Developer:
```

If the command cannot find Obsidian or lacks Developer commands, run the launch helper from the `obsidian-plugin-autodebug` skill before debugging plugin code:

```bash
node /Volumes/SDD2T/obsidian-vault-write/custom-project/my-skills/custom/obsidian-plugin-autodebug/scripts/obsidian_debug_launch_app.mjs --mode auto --vault-name "testvault" --output .obsidian-debug/app-launch.json
```

- [ ] **Step 2: Deploy built artifacts to the macOS Test Vault**

Run these commands as separate steps, not chained:

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

```bash
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
```

```bash
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

Expected:

```text
all copy commands exit 0
```

- [ ] **Step 3: Verify deployed BUILD_ID freshness**

Run:

```bash
BUILD_ID=$(rg -o 'BUILD_ID[^\\n]+' dist/main.js | head -n 1)
printf '%s\n' "$BUILD_ID"
rg -F "$BUILD_ID" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Expected:

```text
the same BUILD_ID appears in the deployed Test Vault main.js
```

- [ ] **Step 4: Reload the plugin**

Run:

```bash
obsidian plugin:reload id=opencodian
```

Expected:

```text
reload completes without plugin load errors
```

- [ ] **Step 5: Open Capability Lab and run the probe suite via Obsidian runtime**

Run an `obsidian eval` assertion that opens settings, locates the OpenCode SDK probe block, clicks the run button, and returns JSON. Use the actual selectors from Task 5:

```bash
obsidian eval vault="testvault" code="(async()=>{const plugin=app.plugins.plugins.opencodian; await plugin.openSetting?.(); await new Promise((resolve)=>setTimeout(resolve,1000)); const block=document.querySelector('[data-section-block=\"opencode-sdk-capabilities\"]'); if(!block) return JSON.stringify({ok:false, reason:'probe block missing'}); const button=block.querySelector('button'); if(!button) return JSON.stringify({ok:false, reason:'run button missing'}); button.click(); await new Promise((resolve)=>setTimeout(resolve,4000)); const rows=Array.from(block.querySelectorAll('[data-capability-id]')).map((row)=>({id:row.getAttribute('data-capability-id'), status:row.getAttribute('data-probe-status'), text:row.textContent?.slice(0,240)})); return JSON.stringify({ok:rows.length>0, rows});})()"
```

Expected:

```json
{"ok":true,"rows":[...]}
```

The returned rows must include `v2.health.get`, `v2.session.active`, `v2.permission.request.list`, and `v2.projectCopy.create`. State-changing rows such as `v2.projectCopy.create` must report `skipped`, not `pass`.

- [ ] **Step 6: Capture console and errors**

Run:

```bash
obsidian dev:console limit=200 > .obsidian-debug/opencode-sdk-117-console.txt
obsidian dev:errors > .obsidian-debug/opencode-sdk-117-errors.txt
```

Expected:

```text
no new OpenCodian plugin load errors; probe failures are allowed only when represented as fail/missing/skipped rows in the Capability Lab output
```

- [ ] **Step 7: Capture DOM evidence**

Run:

```bash
obsidian dev:dom selector='[data-section-block="opencode-sdk-capabilities"]' all > .obsidian-debug/opencode-sdk-117-capability-dom.txt
```

Expected:

```text
DOM output contains data-capability-id rows and diagnostic-only copy
```

- [ ] **Step 8: Save final runtime evidence summary**

Create `.obsidian-debug/opencode-sdk-117-capability-summary.md` with:

```markdown
# OpenCode SDK 1.17 Capability Runtime Evidence

- Build command: `npm run build`
- Deploy target: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Reload command: `obsidian plugin:reload id=opencodian`
- Probe invocation: `obsidian eval ... [data-section-block="opencode-sdk-capabilities"]`
- Console artifact: `.obsidian-debug/opencode-sdk-117-console.txt`
- Error artifact: `.obsidian-debug/opencode-sdk-117-errors.txt`
- DOM artifact: `.obsidian-debug/opencode-sdk-117-capability-dom.txt`

## Capability Matrix

Paste the pass/fail/missing/skipped rows returned by the eval assertion here.
```

- [ ] **Step 9: Commit only source fixes if Autodebug exposed defects**

If Autodebug required a source fix, commit the fix and rerun Task 7 and Task 8:

```bash
git status --short
git add src/features/settings/SettingsCapabilityLabSection.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
git commit -m "Fix OpenCode SDK capability runtime probe"
```

Replace the two `git add` paths above with the concrete source/test/doc files shown by `git status --short` if the Autodebug defect is in a different file. Do not use a broad `git add .`.

Do not commit `.obsidian-debug/` artifacts unless the user explicitly asks.

---

### Task 9: Final Handoff

**Files:**
- No edits expected.

**Interfaces:**
- Consumes: completed commits, local verification, Autodebug runtime artifacts.
- Produces: final implementation report for the user.

- [ ] **Step 1: Inspect final worktree state**

Run:

```bash
git status --short
git log --oneline -8
```

Expected:

```text
implementation commits are visible; unrelated pre-existing dirty files are still identifiable and not mixed into this work
```

- [ ] **Step 2: Prepare final summary**

The final response must include:

```text
Result:
- SDK upgraded to @opencode-ai/sdk 1.17.17.
- Capability registry and probe runner added.
- Capability Lab renders and runs the SDK 1.17 probe matrix.
- State-changing probes are skipped with explicit reasons.

Verification:
- npm test -- ...
- npm run typecheck
- npm run build
- npm run check:module-docs
- npm run check:graphify
- Obsidian Plugin Autodebug/Test Vault reload and probe evidence:
  - .obsidian-debug/opencode-sdk-117-console.txt
  - .obsidian-debug/opencode-sdk-117-errors.txt
  - .obsidian-debug/opencode-sdk-117-capability-dom.txt
  - .obsidian-debug/opencode-sdk-117-capability-summary.md

Capability matrix:
- pass: copy the pass count from .obsidian-debug/opencode-sdk-117-capability-summary.md
- fail: copy the fail count from .obsidian-debug/opencode-sdk-117-capability-summary.md
- missing: copy the missing count from .obsidian-debug/opencode-sdk-117-capability-summary.md
- skipped: copy the skipped count from .obsidian-debug/opencode-sdk-117-capability-summary.md

Notes:
- New SDK capabilities are not productized outside Capability Lab.
- Legacy HTTP/SSE fallback paths remain intact.
- .obsidian-debug artifacts were not committed.
```

- [ ] **Step 3: Stop**

Do not proceed to productize any SDK 1.17 capability into ordinary Chat or Settings flows in this plan.
