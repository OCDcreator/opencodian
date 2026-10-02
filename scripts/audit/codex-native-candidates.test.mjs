import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  applyDisabledPluginSelection, candidateIds, classifyCandidate,
  encodeDisabledPluginSelection, inspectCandidateSchema, isGatewayReadResult,
  parseCodexVersion, parseHandshakeVersion,
} from './codex-native-candidates.mjs';

const ref = (name) => ({ $ref: `#/definitions/${name}` });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const stringList = () => ({ type: ['array', 'null'], items: { type: 'string' } });
const rpc = (method, params) => ({ type: 'object', properties: {
  method: { type: 'string', enum: [method] }, params,
}, required: ['method'] });
function fixture() {
  return {
    request: {
      oneOf: [rpc('initialize', ref('InitializeParams')),
        ...['read', 'login', 'cancel'].map((method) => rpc(`account/gatewayOAuth/${method}`, { type: 'null' })),
        rpc('turn/start', ref('TurnStartParams')), rpc('thread/settings/update', ref('ThreadSettingsUpdateParams'))],
      definitions: {
        InitializeParams: { type: 'object', properties: { capabilities: nullable(ref('InitializeCapabilities')) } },
        InitializeCapabilities: { type: 'object', properties: { explicitGatewayOauth: { type: 'boolean' } } },
        TurnStartParams: { type: 'object', properties: { disabledPluginIds: stringList() } },
        ThreadSettingsUpdateParams: { type: 'object', properties: { disabledPluginIds: stringList() } },
      },
    },
    gatewayRead: { type: 'object', required: ['providerId', 'providerName', 'required'], properties: {
      providerId: { type: 'string' }, providerName: { type: 'string' }, required: { type: 'boolean' },
    } },
    itemCompleted: { type: 'object', properties: { item: ref('ThreadItem') }, definitions: {
      ThreadItem: { oneOf: [{ type: 'object', properties: {
        type: { type: 'string', enum: ['mcpToolCall'] }, mcpAppUi: nullable(ref('McpAppUi')),
      } }] },
      McpAppUi: { type: 'object', required: ['resourceUri', 'preferredModelDisplayMode'], properties: {
        resourceUri: { type: 'string' }, preferredModelDisplayMode: ref('McpAppDisplayMode'),
      } },
      McpAppDisplayMode: { type: 'string', enum: ['inline', 'fullscreen'] },
    } },
    threadStart: { type: 'object', properties: { disabledPluginIds: stringList() } },
  };
}
const advertised = { status: 'advertised' };
const versioned = (extra = {}) => ({ installedVersion: '0.160.0', schemaVersion: '0.160.0',
  schema: advertised, connectionId: 'connection-a', ...extra });
const observation = (extra = {}) => ({ initialized: true, runtimeVersion: '0.160.0', connectionId: 'connection-a',
  explicitGatewayOauth: true, method: 'account/gatewayOAuth/read',
  result: { providerId: 'test', providerName: 'Test', required: false, status: null, error: null }, ...extra });

test('versions distinguish CLI output from the client-named handshake user agent', () => {
  assert.equal(parseCodexVersion('codex-cli 0.160.0\n'), '0.160.0');
  assert.equal(parseCodexVersion('codex-cli 0.160.0-alpha.6.1'), '0.160.0-alpha.6.1');
  assert.equal(parseCodexVersion('not a CLI version 0.160.0'), null);
  assert.equal(parseHandshakeVersion('opencodian_t11_audit/0.160.0 (Windows) unknown', 'opencodian_t11_audit'), '0.160.0');
  assert.equal(parseHandshakeVersion('another_client/0.160.0', 'opencodian_t11_audit'), null);
  assert.equal(parseHandshakeVersion('probeXui/0.160.0', 'probe.ui'), null);
  assert.equal(parseHandshakeVersion('probe.ui/0.160.0-alpha.6.1 (Windows)', 'probe.ui'), '0.160.0-alpha.6.1');
});

test('unknown or malformed schemas do not advertise capabilities through string matches', () => {
  for (const bundle of [null, {}, { request: { description: 'gatewayOAuth mcpAppUi disabledPluginIds explicitGatewayOauth' } },
    { ...fixture(), request: { oneOf: [] } }]) {
    for (const result of Object.values(inspectCandidateSchema(bundle))) assert.equal(result.status, 'unknown');
  }
});

test('structural local refs expose advertisement only and experimental update is independent', () => {
  const bundle = fixture();
  const result = inspectCandidateSchema(bundle);
  for (const id of candidateIds) assert.equal(result[id].status, 'advertised');
  assert.equal(result.disabledPluginIds.threadSettingsUpdateAdvertised, true);
  bundle.request.oneOf = bundle.request.oneOf.filter((item) => item.properties.method.enum[0] !== 'thread/settings/update');
  const stable = inspectCandidateSchema(bundle);
  assert.equal(stable.disabledPluginIds.status, 'advertised');
  assert.equal(stable.disabledPluginIds.threadSettingsUpdateAdvertised, false);
});

test('missing methods and fields cannot be supplied by unused definitions or descriptions', () => {
  const bundle = fixture();
  bundle.request.oneOf = bundle.request.oneOf.filter((item) => item.properties.method.enum[0] !== 'account/gatewayOAuth/read');
  bundle.request.description = 'account/gatewayOAuth/read';
  bundle.itemCompleted.definitions.ThreadItem.oneOf[0].properties.type.enum = ['otherTool'];
  bundle.threadStart.properties = {};
  const result = inspectCandidateSchema(bundle);
  for (const id of candidateIds) assert.equal(result[id].status, 'unsupported');
});

test('cyclic refs and unexpected property types never advertise native capabilities', () => {
  const bundle = fixture();
  bundle.request.definitions.InitializeCapabilities = ref('InitializeCapabilities');
  bundle.itemCompleted.definitions.McpAppUi.properties.resourceUri.type = 'number';
  bundle.request.definitions.TurnStartParams.properties.disabledPluginIds.items.type = 'number';
  for (const result of Object.values(inspectCandidateSchema(bundle))) assert.notEqual(result.status, 'advertised');
});

test('partial response schemas keep the affected capability unknown', () => {
  const bundle = fixture();
  delete bundle.gatewayRead;
  delete bundle.threadStart;
  const result = inspectCandidateSchema(bundle);
  assert.equal(result.gatewayOAuth.status, 'unknown');
  assert.equal(result.disabledPluginIds.status, 'unknown');
  assert.equal(result.mcpAppUi.status, 'advertised');
});

test('older complete request registries can prove missing Gateway RPCs even without a response file', () => {
  const bundle = fixture();
  bundle.request.oneOf = bundle.request.oneOf.filter((item) => !item.properties.method.enum[0].startsWith('account/gatewayOAuth/'));
  delete bundle.gatewayRead;
  const result = inspectCandidateSchema(bundle);
  assert.equal(result.gatewayOAuth.status, 'unsupported');
  assert.equal(result.mcpAppUi.status, 'advertised');
  assert.equal(result.disabledPluginIds.status, 'advertised');
});

test('empty partial response schemas remain unknown rather than proving an absent capability', () => {
  const bundle = fixture();
  bundle.gatewayRead = {};
  bundle.itemCompleted = {};
  bundle.threadStart = {};
  for (const result of Object.values(inspectCandidateSchema(bundle))) assert.equal(result.status, 'unknown');
});

test('unknown versions and version mismatch invalidate both schema and native evidence', () => {
  for (const extra of [{ installedVersion: null }, { schemaVersion: null }, { schemaVersion: '0.158.0' },
    { installedVersion: '0.160.0-alpha.6', schemaVersion: '0.160.0' }]) {
    const result = classifyCandidate('gatewayOAuth', versioned({ observation: observation(), ...extra }));
    assert.equal(result.status, 'unknown');
    assert.equal(result.runtimeAvailable, false);
  }
});

test('schema advertisements keep all feature defaults off and model acceptance unverified', () => {
  for (const id of candidateIds) {
    const result = classifyCandidate(id, versioned());
    assert.equal(result.status, 'advertised');
    assert.equal(result.runtimeAvailable, false);
    assert.equal(result.defaultEnabled, false);
    assert.equal(result.configurationComplete, false);
    assert.equal(result.modelAcceptance, 'unverified');
  }
});

test('initialize ACK alone, stale connections and runtime version mismatch prove no candidate', () => {
  for (const extra of [{ initialized: false }, { connectionId: 'old-connection' }, { runtimeVersion: '0.158.0' },
    { method: 'initialize', result: { userAgent: 'probe/0.160.0' } }, { explicitGatewayOauth: false }]) {
    assert.equal(classifyCandidate('gatewayOAuth', versioned({ observation: observation(extra) })).status, 'unknown');
  }
});

test('method-not-found revokes advertisement; auth/config errors and timeouts remain unknown', () => {
  assert.equal(classifyCandidate('gatewayOAuth', versioned({ observation: observation({
    error: { code: -32601, message: 'Method not found' },
  }) })).status, 'unsupported');
  for (const extra of [{ error: { code: -32600, message: 'Configuration reload failed' } },
    { error: { code: -32000, message: 'Sign-in required' } }, { timedOut: true },
    { error: { message: 'unsupported' } }, { error: { code: -32601 }, method: 'unrelated/read' }]) {
    const result = classifyCandidate('gatewayOAuth', versioned({ observation: observation(extra) }));
    assert.equal(result.status, 'unknown');
    assert.equal(result.runtimeAvailable, false);
  }
});

test('successful gateway read observes protocol support independently of sign-in readiness', () => {
  for (const read of [observation().result, { providerId: 'gateway', providerName: 'Gateway', required: true, status: 'notReady' },
    { providerId: 'gateway', providerName: 'Gateway', required: true, status: 'succeeded' }]) {
    assert.equal(isGatewayReadResult(read), true);
    const result = classifyCandidate('gatewayOAuth', versioned({ observation: observation({ result: read }) }));
    assert.equal(result.status, 'observed');
    assert.equal(result.runtimeAvailable, true);
    assert.equal(result.defaultEnabled, false);
    assert.equal(result.modelAcceptance, 'unverified');
    assert.equal(result.configurationComplete, false);
  }
});

test('malformed or unrelated successful reads cannot promote runtime availability', () => {
  for (const read of [{}, { required: false }, { providerId: 'x', providerName: 'X', required: 'false', status: null },
    { providerId: 'x', providerName: 'X', required: true, status: null },
    { providerId: 'x', providerName: 'X', required: false, status: 'succeeded' }]) {
    assert.equal(isGatewayReadResult(read), false);
    assert.equal(classifyCandidate('gatewayOAuth', versioned({ observation: observation({ result: read }) })).status, 'unknown');
  }
  for (const id of ['mcpAppUi', 'disabledPluginIds']) {
    assert.equal(classifyCandidate(id, versioned({ observation: observation() })).runtimeAvailable, false);
  }
});

test('disabled plugin omission/null preserve, empty clears, and a list replaces without mutating inputs', () => {
  const current = ['one@market'];
  const catalog = ['one@market', 'two@market'];
  assert.deepEqual(encodeDisabledPluginSelection(undefined, catalog), {});
  assert.deepEqual(applyDisabledPluginSelection(current, {}), current);
  assert.deepEqual(applyDisabledPluginSelection(current, encodeDisabledPluginSelection(null, catalog)), current);
  assert.deepEqual(applyDisabledPluginSelection(current, encodeDisabledPluginSelection([], null)), []);
  const next = ['two@market'];
  const encoded = encodeDisabledPluginSelection(next, catalog);
  assert.deepEqual(applyDisabledPluginSelection(current, encoded), ['two@market']);
  next.push('one@market');
  assert.deepEqual(encoded, { disabledPluginIds: ['two@market'] });
  assert.deepEqual(current, ['one@market']);
});

test('disabled plugin IDs require exact catalog identity; display names and missing catalog fail', () => {
  for (const [selection, catalog] of [[['one'], ['one@market']], [['one@market'], undefined],
    [['one@market', 'one@market'], ['one@market']], [[''], ['']], [[3], [3]], ['one@market', ['one@market']]]) {
    assert.throws(() => encodeDisabledPluginSelection(selection, catalog));
  }
  assert.equal(classifyCandidate('disabledPluginIds', versioned()).runtimeAvailable, false);
  assert.throws(() => classifyCandidate('not-a-candidate', versioned()));
});

// Optional offline replay of a saved installed bundle. Never spawns Codex or reads user config.
const savedSchema = process.env.CODEX_T11_SCHEMA_DIR;
test('saved installed schema replay stays advertised until a separate native observation', { skip: !savedSchema }, async () => {
  const read = async (name) => JSON.parse(await fs.readFile(path.join(savedSchema, name), 'utf8'));
  const bundle = { request: await read('ClientRequest.json'), gatewayRead: await read('v2/GatewayOAuthReadResponse.json'),
    itemCompleted: await read('v2/ItemCompletedNotification.json'), threadStart: await read('v2/ThreadStartResponse.json') };
  for (const result of Object.values(inspectCandidateSchema(bundle))) assert.equal(result.status, 'advertised');
});
