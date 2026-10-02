/* eslint-disable @typescript-eslint/no-require-imports -- The scripts Jest project loads .mjs tests as untransformed CommonJS; audited ESM contracts run in separate Node processes. */
/** Offline contract tests only. Synthetic evidence here is never a real-model audit result. */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repo = process.cwd();
const runner = path.join(repo, 'scripts/audit/run-aux-query-audit.mjs');
const evidence = process.env.AUDIT_TEST_SCRATCH_ROOT
  || path.join(os.tmpdir(), 'opencodian-aux-contract');
fs.mkdirSync(evidence, { recursive: true });
const scratch = fs.mkdtempSync(path.join(evidence, 't06-offline-contract-'));
const bundle = path.join(scratch, 'generic-contract.mjs');
const marker = path.join(scratch, 'unexpected-native-or-network.txt');
const guard = path.join(scratch, 'no-native-no-network.cjs');
const sentinel = path.join(scratch, 'not-a-cli.exe');
const builtin = path.join(scratch, 'builtin.json');
const personal = path.join(scratch, 'personal.json');
fs.writeFileSync(sentinel, 'offline fixture, never executable');
fs.writeFileSync(builtin, '{}');
fs.writeFileSync(personal, '{}');
fs.writeFileSync(guard, `
  const cp = require('node:child_process');
  const fs = require('node:fs');
  const path = require('node:path');
  const deny = () => { fs.writeFileSync(process.env.AUDIT_TEST_ATTEMPT_MARKER, 'blocked native/network attempt'); throw new Error('offline boundary'); };
  const spawn = cp.spawn;
  cp.spawn = function(command, args, options) {
    const nodeAudit = command === process.execPath && args?.[0]?.endsWith('.mjs')
      && args[0].includes('opencodian-aux-audit-');
    const bundler = /^esbuild(?:\\.exe)?$/.test(path.basename(command)) && args?.some(arg => arg.startsWith('--service='));
    if (!nodeAudit && !bundler) return deny();
    return spawn.call(this, command, args, options);
  };
  for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawnSync', 'fork']) cp[name] = deny;
  globalThis.fetch = deny;
  for (const name of ['node:http', 'node:https']) { const mod = require(name); mod.request = deny; mod.get = deny; }
  const net = require('node:net'); net.connect = deny; net.createConnection = deny;
  require('node:module').syncBuiltinESMExports();
`);

function evaluate(source, entry = runner) {
  const script = 'const audit = await import(' + JSON.stringify(pathToFileURL(entry).href) + '); ' + source;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, AUDIT_AUX_IMPORT_ONLY: '1' },
  }));
}

// These scratch bundles need ESM package entries; jsonc-parser UMD retains relative requires.
beforeAll(() => {
  evaluate('const { default: esbuild } = await import("esbuild"); await esbuild.build({...audit.auditBundleOptions("zcode", '
    + JSON.stringify(bundle) + '), packages:"bundle", mainFields:["module","main"]}); console.log(JSON.stringify({compiled:true}));');
}, 30000);

test('default dispatch covers six; mixed OpenCode2/ZCode selection remains legal and deduplicated', () => {
  const result = evaluate('console.log(JSON.stringify([audit.selectAuditBackends([]), audit.selectAuditBackends(["opencode2", "zcode", "opencode2"])]));');
  expect(result).toEqual([['opencode', 'opencode2', 'claude-code', 'codex', 'pi', 'zcode'], ['opencode2', 'zcode']]);
});

test('unknown backend and conflicting offline modes reject before dispatch', () => {
  const result = evaluate('console.log(JSON.stringify([["zcode","unknown"], ["--preflight","--bundle-only"]].map(args => { try {audit.selectAuditBackends(args); return false;} catch {return true;} })));');
  expect(result).toEqual([true, true]);
  const out = spawnSync(process.execPath, [runner, '--preflight', 'zcode', 'unknown'], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, AUDIT_REPORT_PATH: path.join(scratch, 'unknown.json') },
  });
  expect(out.status).not.toBe(0);
  expect(fs.existsSync(path.join(scratch, 'unknown.json'))).toBe(false);
});

test('failed outranks blocked and blocked exits 2', () => {
  expect(evaluate('console.log(JSON.stringify([[], [{status:"blocked"}], [{status:"failed"},{status:"blocked"}], [{status:"passed"}]].map(audit.auditExitCode)));'))
    .toEqual([2, 2, 1, 0]);
});

test('reports cannot pass on exit code, offline mode, missing checks, or mismatched backend', () => {
  const result = evaluate(`
    const pass = {backend:'zcode', status:'passed', passed:true, execution:'real-model', checks:[{name:'contract-only',ok:true}]};
    const cases = [[null,0], [{...pass,backend:'pi'},0], [{...pass,execution:'preflight'},0],
      [{...pass,checks:[]},0], [{...pass,checks:[{ok:false}]},0], [pass,1],
      [{backend:'zcode',status:'blocked',passed:false,execution:'preflight',checks:[{name:'config',ok:false}]},0],
      [{backend:'zcode',status:'blocked',passed:false,execution:'preflight',checks:[{name:'config',ok:false}]},2],
      [{...pass,checks:{}},0], [{...pass,checks:[{ok:true}]},0], [{...pass,passed:false},0],
      [{...pass,status:'failed',passed:false},0]];
    console.log(JSON.stringify(cases.map(([report,code]) => audit.validateAuditReport('zcode',report,code).status)));
  `);
  expect(result).toEqual(['failed','failed','failed','failed','failed','failed','failed','blocked','failed','failed','failed','failed']);
});

test('generic ZCode model selection requires provider/model and never uses sessionless completion', () => {
  expect(evaluate('console.log(JSON.stringify([audit.parseVisionModel("zcode","provider/model"), audit.parseVisionModel("zcode","invalid")]));', bundle))
    .toEqual([{ kind: 'zcode', provider: 'provider', model: 'model' }, null]);
  const source = fs.readFileSync(path.join(repo, 'scripts/audit/aux-query-audit.entry.ts'), 'utf8');
  expect(source).toContain('adapter.startAuxQuerySession(');
  expect(source).not.toMatch(/startInlineCompletionSession|ZCodeInlineCompletionSession|sessionlessCompletion/);
});

test('zero-tool proof needs fresh native message, empty object, zero count and no native tool event', () => {
  const result = evaluate(`
    const proof = {backend:'zcode',enforcedPolicy:'none',effectiveTools:[],deniedCapabilities:['write'],mechanism:'fixture'};
    const record = {sessionId:'fixture',storage:'fixture',exited:false,priorUserIds:new Set(['old']),lastUsers:[],
      currentUsers:[{id:'new',tools:{}}],toolEvents:[],toolCallCount:0};
    const records = [record, {...record,currentUsers:[]}, {...record,currentUsers:[{id:'old',tools:{}}]},
      {...record,currentUsers:[{id:'new'}]}, {...record,currentUsers:[{id:'new',tools:[]}]},
      {...record,currentUsers:[{id:'new',tools:{Write:true}}]}, {...record,currentUsers:[{id:'new',tools:{Write:false}}]},
      {...record,toolCallCount:undefined}, {...record,toolCallCount:1}, {...record,toolEvents:['tool.started']}];
    console.log(JSON.stringify(records.map(value => audit.verifyZCodeNativeReadback(value, proof).ok)));
  `, bundle);
  expect(result).toEqual([true, false, false, false, false, false, false, false, false, false]);
});

test('byte snapshot includes hidden/node_modules and empty directories; unreadable root rejects', () => {
  const vault = path.join(scratch, 'byte-snapshot');
  fs.mkdirSync(path.join(vault, 'node_modules'), {recursive:true});
  fs.mkdirSync(path.join(vault, '.git'));
  fs.mkdirSync(path.join(vault, 'unexpected-empty'));
  fs.writeFileSync(path.join(vault, 'note.md'), 'bytes');
  fs.writeFileSync(path.join(vault, 'node_modules', 'injected'), 'unexpected');
  fs.writeFileSync(path.join(vault, '.git', 'injected'), 'unexpected');
  const result = evaluate('let rejected=false; try {audit.snapshotTree(' + JSON.stringify(path.join(vault,'missing')) + ');} catch {rejected=true;} '
    + 'console.log(JSON.stringify({files:[...audit.snapshotTree(' + JSON.stringify(vault) + ').keys()],rejected}));', bundle);
  expect(result.files).toEqual(expect.arrayContaining(['note.md', path.join('node_modules','injected'), path.join('.git','injected'), 'unexpected-empty' + path.sep]));
  expect(result.rejected).toBe(true);
});

test('six backend preflight cannot spawn native CLI or use network even with explicit model settings', () => {
  const report = path.join(scratch, 'guarded-preflight.json');
  const out = spawnSync(process.execPath, [runner, '--preflight'], {
    cwd: repo, encoding:'utf8', timeout:60000,
    env: { ...process.env, NODE_OPTIONS: (process.env.NODE_OPTIONS || '') + ' --require=' + JSON.stringify(guard),
      AUDIT_TEST_ATTEMPT_MARKER:marker, AUDIT_REPORT_PATH:report, AUDIT_SCRATCH_ROOT:scratch,
      AUDIT_AUX_MODEL:'contract/fixture', AUDIT_AUX_VISION_MODEL:'contract/fixture', AUDIT_AUX_CONTROL_MODEL:'contract/fixture',
      ZCODE_BIN:sentinel, PI_BIN:sentinel, OPENCODE2_BIN:sentinel, CODEX_BIN:sentinel,
      ZCODE_BUILTIN_PROVIDER_CONFIG_FILE:builtin, ZCODE_PERSONAL_PROVIDER_CONFIG_FILE:personal },
  });
  expect(out.status).toBe(2);
  expect(fs.existsSync(marker)).toBe(false);
  const value = JSON.parse(fs.readFileSync(report,'utf8'));
  expect(value.outcomes).toHaveLength(6);
  expect(value.outcomes.every(item => item.status==='blocked' && item.passed===false && item.execution==='preflight')).toBe(true);
  expect(out.stdout + out.stderr).not.toContain('contract/fixture');
}, 70000);

test('OpenCode2 retains native wildcard deny, real write control, bytes and native cleanup checks', () => {
  const source = fs.readFileSync(path.join(repo,'scripts/audit/opencode2-aux-query-audit.entry.ts'),'utf8');
  expect(source).toContain('positive unrestricted write control');
  expect(source).toContain('readSafetyRules()');
  expect(source).toContain('vault bytes unchanged');
  expect(source).toContain('native session and isolated directories removed');
  expect(source).not.toMatch(/detail: result|detail: cancelled|image, imageRules/);
});

// This bundle exposes the actual audit functions only in tests. Native client/process/HTTP
// seams below are synthetic and cannot produce a real-model audit pass.
const lifecycleBundle = path.join(scratch, 'lifecycle-and-control-contract.mjs');
beforeAll(() => {
  const entry = path.join(repo, 'scripts/audit/aux-query-audit.entry.ts');
  const scope = path.join(repo, 'src/core/agents/backend/auxiliary/OpenCodeAuxScope.ts');
  evaluate(`
    const { default: esbuild } = await import('esbuild');
    const fs = await import('node:fs');
    const options = audit.auditBundleOptions('codex', ${JSON.stringify(lifecycleBundle)});
    await esbuild.build({ ...options, packages:'bundle', mainFields:['module','main'], plugins:[...options.plugins, {
      name:'offline-lifecycle-and-control-seams',
      setup(build) {
        build.onLoad({ filter:/aux-query-audit[.]entry[.]ts$/ }, args => ({
          contents: fs.readFileSync(args.path,'utf8') + String.fromCharCode(10) + 'export {createCodexHarness,runWriteInducementControl};', loader:'ts'
        }));
        build.onResolve({ filter:/CodexAppServerClient$/ }, args => args.importer === ${JSON.stringify(entry)}
          ? {path:'client',namespace:'offline-audit'} : undefined);
        build.onResolve({ filter:/OpenCodeAuxScope$/ }, args => args.importer === ${JSON.stringify(entry)}
          ? {path:'scope',namespace:'offline-audit'} : undefined);
        build.onLoad({ filter:/^client$/,namespace:'offline-audit' }, () => ({ contents:
          'export class CodexAppServerClient { constructor() { return globalThis.__offlineCatalogClient; } }'
        }));
        build.onResolve({ filter:/.*/,namespace:'offline-audit' }, args => ({path:args.path,namespace:'file'}));
        build.onLoad({ filter:/^scope$/,namespace:'offline-audit' }, () => ({ contents:
          'export {killProcessTree,OPENCODE_AUX_AGENT,OpenCodeAuxScope,scopeUrl} from ' + ${JSON.stringify(JSON.stringify(scope))} + ';'
          + 'export function resolveOpenCodeExecutable(){return {path:"offline-non-executable",shell:false};}'
        }));
      }
    }] });
    console.log(JSON.stringify({compiled:true}));
  `);
}, 30000);

test.each([
  ['active', false], ['archived', false], ['active', true], ['archived', true],
])('Codex construction rejection in %s awaits stop exactly once; cleanupReject=%s preserves the original error', (partition, cleanupReject) => {
  const result = evaluate(`
    process.env.CODEX_BIN = ${JSON.stringify(sentinel)};
    const original = new Error('synthetic catalog failure');
    const calls = []; let starts = 0, stops = 0, cleanupFinished = false, settled = false;
    let releaseStop;
    const stopGate = new Promise(resolve => {releaseStop = resolve;});
    globalThis.__offlineCatalogClient = {
      async start(){starts++;},
      async listAllThreads(options){
        calls.push(options.archived ? 'archived' : 'active');
        if (options.archived === ${partition === 'archived'}) throw original;
        return [{id:'fixture-active'}];
      },
      async stop(){stops++; await stopGate; cleanupFinished = true;
        if (${cleanupReject}) throw new Error('synthetic cleanup failure');}
    };
    const pending = audit.createCodexHarness({vault:${JSON.stringify(scratch)},notePath:'fixture',noteBody:'fixture'})
      .then(() => ({resolved:true}), error => ({sameError:error === original})).finally(() => {settled = true;});
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    const settledBeforeCleanup = settled;
    releaseStop();
    const outcome = await pending;
    console.log(JSON.stringify({starts,stops,cleanupFinished,settledBeforeCleanup,calls,...outcome}));
  `, lifecycleBundle);
  expect(result).toEqual({starts:1,stops:1,cleanupFinished:true,settledBeforeCleanup:false,
    calls:partition === 'active' ? ['active'] : ['active','archived'],sameError:true});
});

test.each([
  ['explicit control', 'codex', 'chosen-provider/chosen-model', 'fallback-provider/fallback-model', '', 'explicit-control', {providerID:'chosen-provider',modelID:'chosen-model'}],
  ['explicit wins', 'opencode', 'chosen-provider/chosen-model', 'fallback-provider/fallback-model', '', 'explicit-control', {providerID:'chosen-provider',modelID:'chosen-model'}],
  ['OpenCode backend fallback', 'opencode', null, 'fallback-provider/fallback-model', '', 'opencode-model-fallback', {providerID:'fallback-provider',modelID:'fallback-model'}],
  ['OpenCode global fallback', 'opencode', null, null, 'global-provider/global-model', 'opencode-model-fallback', {providerID:'global-provider',modelID:'global-model'}],
])('shared control sends the preflight-approved request model: %s', (...fixture) => {
  const [, backend, control, backendModel, globalModel, modelSource, expectedModel] = fixture;
  const result = evaluate(`
    delete process.env.AUDIT_AUX_CONTROL_MODEL;
    delete process.env.AUDIT_AUX_MODEL_OPENCODE;
    delete process.env.AUDIT_AUX_MODEL;
    const control = ${JSON.stringify(control)}, backendModel = ${JSON.stringify(backendModel)};
    if (control !== null) process.env.AUDIT_AUX_CONTROL_MODEL = control;
    if (backendModel !== null) process.env.AUDIT_AUX_MODEL_OPENCODE = backendModel;
    process.env.AUDIT_AUX_MODEL = ${JSON.stringify(globalModel)};
    process.env.AUDIT_AUX_VISION_MODEL = 'fixture/vision';
    const cp = (await import('node:child_process')).default;
    const net = (await import('node:net')).default;
    let spawned = 0, listened = 0; const requests = [];
    cp.spawn = () => {spawned++;return {stdout:{on(){}},stderr:{on(){}},pid:undefined};};
    net.createServer = () => ({once(){},listen(_port,_host,callback){listened++;callback();},
      address(){return {port:43210};},close(callback){callback();}});
    (await import('node:module')).syncBuiltinESMExports();
    const fs = await import('node:fs'); const path = await import('node:path');
    globalThis.fetch = async (url, options = {}) => {
      const route = new URL(url).pathname;
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({route,body});
      if (route === '/config') return {ok:true};
      if (route === '/session') return {json:async () => ({id:'fixture-control'})};
      if (route === '/session/fixture-control/message') {
        fs.writeFileSync(path.join(${JSON.stringify(scratch)},'aux-control-escape.md'),'fixture');
        return {ok:true};
      }
      throw new Error('unexpected synthetic route');
    };
    const preflight = audit.auditPreflight(${JSON.stringify(backend)});
    const outcome = await audit.runWriteInducementControl({vault:${JSON.stringify(scratch)},notePath:'fixture',noteBody:'fixture'},${JSON.stringify(backend)});
    let evidence; try {evidence = JSON.parse(outcome.detail);} catch {evidence = {};}
    const model = requests.find(value => value.route.endsWith('/message'))?.body.model;
    const hash = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(model)).digest('hex');
    console.log(JSON.stringify({ok:outcome.ok,spawned,listened,model,modelSource:evidence.modelSource,
      profileMatchesRequest:evidence.modelProfileSha256 === hash,
      preflightControlAccepted:!preflight.some(value => value.includes('AUDIT_AUX_CONTROL_MODEL')),
      rawModelInReport:outcome.detail.includes(model.providerID)||outcome.detail.includes(model.modelID)}));
  `, lifecycleBundle);
  expect(result).toEqual({ok:true,spawned:1,listened:1,model:expectedModel,modelSource,
    profileMatchesRequest:true,preflightControlAccepted:true,rawModelInReport:false});
});

test('another backend cannot reuse the OpenCode model fallback; invalid explicit control cannot silently fallback', () => {
  const result = evaluate(`
    process.env.AUDIT_AUX_MODEL_OPENCODE = 'fixture/fallback';
    process.env.AUDIT_AUX_MODEL = 'fixture/global';
    let attempts = 0;
    const cp = (await import('node:child_process')).default;
    const net = (await import('node:net')).default;
    const deny = () => {attempts++;throw new Error('unexpected execution');};
    cp.spawn = deny; net.createServer = deny; globalThis.fetch = deny;
    (await import('node:module')).syncBuiltinESMExports();
    const rejected = [];
    for (const [backend,control] of [['claude-code',null],['opencode','invalid']]) {
      delete process.env.AUDIT_AUX_CONTROL_MODEL;
      if(control !== null) process.env.AUDIT_AUX_CONTROL_MODEL = control;
      const preflight = audit.auditPreflight(backend);
      try {await audit.runWriteInducementControl({vault:${JSON.stringify(scratch)},notePath:'fixture',noteBody:'fixture'},backend);rejected.push(false);}
      catch {rejected.push(preflight.some(value => value.includes('AUDIT_AUX_CONTROL_MODEL')));}
    }
    console.log(JSON.stringify({attempts,rejected}));
  `, lifecycleBundle);
  expect(result).toEqual({attempts:0,rejected:[true,true]});
});
