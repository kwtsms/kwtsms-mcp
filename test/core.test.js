/**
 * FILE:      test/core.test.js
 * CREATED:   2026-11-08 17:05 +03
 * TASK:      new-int-w1-mcp
 * AUTHOR:    M Alhassoun
 * WHAT:      Offline tests: send modes and safety (preview sends nothing, live needs the owner's flag and confirm,
 *            caps, allowed prefixes, fixed sender, client_ref), segment math, and an MCP round trip with the SDK client.
 * WHY:       An AI model drives these tools; the limits must hold whatever the model asks.
 * USAGE:     npm test
 * DEPENDS:   node:test; a fake kwtSMS client (no network, no credentials).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTools, segments, configFromEnv, guardClient, MIN_GAP_MS } from '../src/core.js';
import { buildServer } from '../src/server.js';
import { VERSION } from '../src/version.js';

const NUM = '96550000001'; // fake Kuwait-format numbers, never sent anywhere
const NUM2 = '96550000002';

function fakeClient() {
  const calls = [];
  return {
    calls,
    async send(mobiles, message, sender) {
      calls.push({ mobiles, message, sender });
      return { result: 'OK', 'msg-id': 'abc123def456', numbers: mobiles.length, 'points-charged': mobiles.length, 'balance-after': 99 };
    },
    async verify() { return [true, 100, null]; },
    async senderids() { return { result: 'OK', senderids: ['KWT-SMS', 'MyShop'] }; },
    async coverage() { return { result: 'OK', prefixes: ['965'] }; },
    async validate(m) { return { ok: m, er: [], nr: [], rejected: [] }; },
    async status() { return { result: 'OK', status: 'sent' }; },
  };
}
const cfg = (over = {}) => ({ ...configFromEnv({ KWTSMS_SENDER_ID: 'MyShop' }), ...over });
const body = (r) => JSON.parse(r.content[0].text);

describe('send_sms', () => {
  it('preview (default) sends nothing and reports parts and credits', async () => {
    const client = fakeClient();
    const t = createTools({ client, config: cfg() });
    const r = await t.send_sms.handler({ mobiles: [NUM, NUM2], message: 'Hello' });
    assert.equal(client.calls.length, 0);
    const b = body(r);
    assert.equal(b.sent, false);
    assert.equal(b.estimated_credits, 2);
    assert.equal(b.sender, 'MyShop');
  });

  it('test mode goes through the test client with the fixed sender', async () => {
    const client = fakeClient();
    const t = createTools({ client, config: cfg() });
    const r = await t.send_sms.handler({ mobiles: [NUM], message: 'Hello', mode: 'test' });
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].sender, 'MyShop');
    assert.equal(body(r).sent, true);
  });

  it('live is refused unless the owner allowed it, and then needs confirm', async () => {
    const client = fakeClient();
    const live = fakeClient();
    let r = await createTools({ client, liveClient: live, config: cfg() }).send_sms.handler({ mobiles: [NUM], message: 'x', mode: 'live', confirm: true });
    assert.equal(r.isError, true);
    const t = createTools({ client, liveClient: live, config: cfg({ allowLive: true }) });
    r = await t.send_sms.handler({ mobiles: [NUM], message: 'x', mode: 'live' });
    assert.equal(r.isError, true);
    assert.equal(live.calls.length, 0);
    r = await t.send_sms.handler({ mobiles: [NUM], message: 'x', mode: 'live', confirm: true });
    assert.equal(live.calls.length, 1);
    assert.equal(client.calls.length, 0);
  });

  it('enforces numbers per call, allowed prefixes and the hourly cap', async () => {
    const client = fakeClient();
    const t = createTools({ client, config: cfg({ maxNumbersPerCall: 2, maxSendsPerHour: 3 }) });
    assert.equal((await t.send_sms.handler({ mobiles: [NUM, NUM2, '96550000003'], message: 'x', mode: 'test' })).isError, true);
    const foreign = await t.send_sms.handler({ mobiles: ['971500000001'], message: 'x', mode: 'test' });
    assert.equal(foreign.isError, true);
    assert.equal(client.calls.length, 0);
    await t.send_sms.handler({ mobiles: [NUM, NUM2], message: 'x', mode: 'test' });
    const over = await t.send_sms.handler({ mobiles: [NUM, NUM2], message: 'x', mode: 'test' });
    assert.equal(over.isError, true);
    assert.match(over.content[0].text, /Hourly limit/);
    assert.equal(client.calls.length, 1);
  });

  it('client_ref stops a repeated send', async () => {
    const client = fakeClient();
    const t = createTools({ client, config: cfg() });
    await t.send_sms.handler({ mobiles: [NUM], message: 'x', mode: 'test', client_ref: 'order-1' });
    const again = await t.send_sms.handler({ mobiles: [NUM], message: 'x', mode: 'test', client_ref: 'order-1' });
    assert.equal(client.calls.length, 1);
    assert.match(body(again).note, /not sent again/);
  });

  it('numbers are masked in results', async () => {
    const t = createTools({ client: fakeClient(), config: cfg() });
    const b = body(await t.send_sms.handler({ mobiles: [NUM], message: 'x' }));
    assert.ok(!JSON.stringify(b).includes(NUM));
  });
});

describe('config', () => {
  it('live sending is on only for 1 or true', () => {
    assert.equal(configFromEnv({ KWTSMS_MCP_ALLOW_LIVE: '1' }).allowLive, true);
    assert.equal(configFromEnv({ KWTSMS_MCP_ALLOW_LIVE: 'true' }).allowLive, true);
    assert.equal(configFromEnv({ KWTSMS_MCP_ALLOW_LIVE: 'false' }).allowLive, false);
    assert.equal(configFromEnv({}).allowLive, false);
  });
});

describe('segments', () => {
  it('GSM-7: 160 is one part, 161 is two', () => {
    assert.equal(segments('a'.repeat(160)).parts, 1);
    assert.equal(segments('a'.repeat(161)).parts, 2);
  });
  it('Arabic: 70 is one part, 71 is two', () => {
    assert.equal(segments('م'.repeat(70)).parts, 1);
    assert.equal(segments('م'.repeat(71)).parts, 2);
  });
  it('GSM extension characters count double', () => {
    assert.equal(segments('{'.repeat(80)).characters, 160);
  });
});

describe('MCP protocol', () => {
  it('lists the six tools with annotations and answers a preview call', async () => {
    const server = buildServer({ client: fakeClient(), config: cfg() });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 'test', version: '1' });
    await Promise.all([server.connect(a), c.connect(b)]);
    const { tools } = await c.listTools();
    assert.deepEqual(tools.map((x) => x.name).sort(),
      ['check_coverage', 'get_balance', 'get_message_status', 'list_sender_ids', 'send_sms', 'validate_numbers']);
    assert.equal(tools.find((x) => x.name === 'send_sms').annotations.destructiveHint, true);
    assert.equal(tools.find((x) => x.name === 'get_balance').annotations.readOnlyHint, true);
    const r = await c.callTool({ name: 'send_sms', arguments: { mobiles: [NUM], message: 'Hi' } });
    assert.equal(JSON.parse(r.content[0].text).sent, false);
    await c.close();
  });
});

describe('version', () => {
  it('package.json and src/version.js agree', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
    assert.equal(pkg.version, VERSION);
    const sj = JSON.parse(readFileSync(new URL('../server.json', import.meta.url)));
    assert.equal(sj.version, VERSION);
    assert.equal(sj.packages[0].version, VERSION);
    assert.equal(sj.name, pkg.mcpName);
  });
});

// 2026-11-09 12:23 +03: rate guard (firewall bans an address after 8 calls in 10 seconds), #1165
describe('rate guard', () => {
  it('spaces calls at least MIN_GAP_MS apart, one at a time', async () => {
    let t = 0; const at = [];
    const raw = { async status() { at.push(t); return { result: 'OK' }; } };
    const g = guardClient(raw, { now: () => t, sleep: async (ms) => { t += ms; } });
    await Promise.all([g.status('a'), g.status('b'), g.status('c')]);
    assert.deepEqual(at, [0, MIN_GAP_MS, 2 * MIN_GAP_MS]);
    assert.ok(10000 / MIN_GAP_MS < 8, 'fewer than 8 calls in any 10 seconds');
  });
  it('stops every later call after a wrong password (no loop against the API)', async () => {
    let n = 0;
    const raw = { async send() { n++; return { result: 'ERROR', code: 'ERR003' }; }, async status() { n++; return { result: 'OK' }; } };
    const g = guardClient(raw, { now: () => 0, sleep: async () => {} });
    await g.send(['x'], 'm', 's');
    const r = await g.status('id');
    assert.equal(n, 1);
    assert.equal(r.code, 'ERR003');
    assert.match(r.description, /restart/);
  });
  it('stops after verify reports wrong credentials', async () => {
    let n = 0;
    const raw = { async verify() { n++; return [false, null, 'Wrong username or password.']; } };
    const g = guardClient(raw, { now: () => 0, sleep: async () => {} });
    await g.verify(); const r = await g.verify();
    assert.equal(n, 1); assert.equal(r[0], false);
  });
  it('caps numbers per call at 200', () => {
    assert.equal(configFromEnv({ KWTSMS_MCP_MAX_NUMBERS: '5000' }).maxNumbersPerCall, 200);
  });
});
