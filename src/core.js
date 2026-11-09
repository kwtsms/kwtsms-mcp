/**
 * FILE:      src/core.js
 * CREATED:   2026-11-08 17:05 +03
 * TASK:      new-int-w1-mcp (Boss 2026-11-08 16:46: one new integration a week, AI side first)
 * AUTHOR:    M Alhassoun
 * WHAT:      The kwtSMS MCP tool layer: tool definitions, input checks, send safety (modes, caps, allowed prefixes,
 *            fixed sender, client_ref de-duplication) and SMS segment math. No transport code here.
 * WHY:       One tool layer for every transport: stdio now (src/stdio.js), Streamable HTTP later (hosted server).
 * USAGE:     const tools = createTools({ client, config }); tools.send_sms.handler({...})
 * DEPENDS:   kwtsms (kwtsms-js) for phone normalisation and message cleaning; a KwtSMS-like client object.
 */

import { cleanMessage, validatePhoneInput } from 'kwtsms';

/** GSM 03.38 basic and extension characters (an SMS with only these uses 160/153 characters per part). */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';

/** Parts and encoding of an SMS text, the way operators bill it. */
export function segments(text) {
  let gsm = true;
  let units = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXT.includes(ch)) units += 2;
    else { gsm = false; break; }
  }
  if (gsm) {
    return { encoding: 'GSM-7', characters: units, parts: units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  const length = [...text].reduce((n, ch) => n + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0);
  return { encoding: 'UCS-2 (Unicode, Arabic)', characters: length, parts: length <= 70 ? 1 : Math.ceil(length / 67) };
}

/** Reads the operator's settings from the environment; nothing here can be changed by the AI model. */
// 2026-11-09 16:22 +03: Claude plugin settings arrive as CLAUDE_PLUGIN_OPTION_<KEY> (Anthropic directory lint); the
// KWTSMS_* names keep working for every other client. A KWTSMS_* value wins when both are set.
const PLUGIN_NAMES = {
  KWTSMS_USERNAME: 'USERNAME', KWTSMS_PASSWORD: 'PASSWORD', KWTSMS_SENDER_ID: 'SENDER_ID', KWTSMS_MCP_ALLOW_LIVE: 'ALLOW_LIVE',
  KWTSMS_MCP_MAX_NUMBERS: 'MAX_NUMBERS', KWTSMS_MCP_MAX_PER_HOUR: 'MAX_PER_HOUR',
  KWTSMS_MCP_MAX_CREDITS_PER_DAY: 'MAX_CREDITS_PER_DAY', KWTSMS_MCP_ALLOWED_PREFIXES: 'ALLOWED_COUNTRIES',
};
export function withPluginOptions(env) {
  const out = { ...env };
  for (const [ours, key] of Object.entries(PLUGIN_NAMES)) {
    const v = env[`CLAUDE_PLUGIN_OPTION_${key}`];
    if (!out[ours] && v !== undefined && v !== '') out[ours] = v;
  }
  return out;
}

export function configFromEnv(rawEnv = process.env) {
  const env = withPluginOptions(rawEnv);
  const int = (v, d) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    username: env.KWTSMS_USERNAME || '',
    password: env.KWTSMS_PASSWORD || '',
    senderId: env.KWTSMS_SENDER_ID || 'KWT-SMS',
    allowLive: ['1', 'true'].includes(String(env.KWTSMS_MCP_ALLOW_LIVE || '').toLowerCase()), // 2026-11-08 18:07 +03: 'true' from Claude Code plugin settings
    // 2026-11-09 12:23 +03: capped at 200 (one API call per send; the library would otherwise batch with short pauses)
    maxNumbersPerCall: Math.min(int(env.KWTSMS_MCP_MAX_NUMBERS, 10), 200),
    maxSendsPerHour: int(env.KWTSMS_MCP_MAX_PER_HOUR, 50),
    maxCreditsPerDay: int(env.KWTSMS_MCP_MAX_CREDITS_PER_DAY, 100),
    allowedPrefixes: (env.KWTSMS_MCP_ALLOWED_PREFIXES || '965').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

// 2026-11-09 12:27 +03 (#1165): the kwtSMS firewall bans an
// address after repeated FAILED logins (ERR003); successful calls are not counted. So the important part is to stop
// after an account error instead of retrying; spacing the calls (one at a time) is extra care for loops.
export const MIN_GAP_MS = 1500; // one call at a time, a calm pace
const STOP_CODES = new Set(['ERR001', 'ERR002', 'ERR003', 'ERR004', 'ERR005', 'ERR024', 'ERR034']);
const STOP_TEXT = /username or password|authentication error|not have api access|has been blocked|api lockdown|banned proxy|api off|required parameter is missing/i;

/** Wraps a KwtSMS client: one call at a time, MIN_GAP_MS apart, and no calls after an account error. */
export function guardClient(client, { gapMs = MIN_GAP_MS, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = -Infinity;
  let queue = Promise.resolve();
  let stopped = null;
  const stopReply = () => ({
    result: 'ERROR',
    code: stopped,
    description: `Stopped after ${stopped}: fix the kwtSMS setting (API username, password, IP or account) and restart this server. Repeated calls can get this address blocked.`,
  });
  const call = (name, args) => {
    const run = async () => {
      if (stopped) return name === 'verify' ? [false, null, stopReply().description] : stopReply();
      const wait = last + gapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      const r = await client[name](...args);
      if (Array.isArray(r)) { if (r[0] === false && STOP_TEXT.test(String(r[2] || ''))) stopped = 'ERR003'; }
      else if (r && STOP_CODES.has(r.code)) stopped = r.code;
      return r;
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  };
  return new Proxy(client, {
    get(target, prop) {
      const v = target[prop];
      return typeof v === 'function' && ['send', 'verify', 'senderids', 'coverage', 'validate', 'status'].includes(prop)
        ? (...args) => call(prop, args) : v;
    },
  });
}

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

/** Numbers are shown to the model only partly, so they do not spread through chat logs. */
const mask = (n) => (n.length > 6 ? n.slice(0, 5) + '*'.repeat(n.length - 7) + n.slice(-2) : n);

/**
 * Builds the tools. `client` is a KwtSMS instance (or a test double); `liveClient` is the same account with
 * test mode off, only created when the operator allows live sends.
 */
export function createTools({ client, liveClient = null, config, now = () => Date.now() }) {
  const sentLog = []; // { at, numbers, credits } for the hourly and daily caps
  const refs = new Map(); // client_ref -> earlier result

  function prepare(mobiles, message) {
    if (!Array.isArray(mobiles) || mobiles.length === 0) return { error: 'Give at least one phone number.' };
    if (mobiles.length > config.maxNumbersPerCall) {
      return { error: `At most ${config.maxNumbersPerCall} numbers per call (set by the account owner).` };
    }
    const valid = [];
    const invalid = [];
    for (const raw of mobiles) {
      const [ok, err, normalized] = validatePhoneInput(String(raw));
      if (!ok) invalid.push({ input: String(raw), error: err });
      else if (!config.allowedPrefixes.some((p) => normalized.startsWith(p))) {
        invalid.push({ input: String(raw), error: `country not allowed (allowed: ${config.allowedPrefixes.join(', ')})` });
      } else if (!valid.includes(normalized)) valid.push(normalized);
    }
    const cleaned = cleanMessage(String(message || ''));
    if (!cleaned.trim()) return { error: 'The message is empty after cleaning (emoji and hidden characters are removed).' };
    const seg = segments(cleaned);
    return { valid, invalid, cleaned, seg, credits: seg.parts * valid.length };
  }

  function capsBlock(numbers, credits) {
    const t = now();
    const hour = sentLog.filter((s) => t - s.at < 3600e3).reduce((n, s) => n + s.numbers, 0);
    const day = sentLog.filter((s) => t - s.at < 86400e3).reduce((n, s) => n + s.credits, 0);
    if (hour + numbers > config.maxSendsPerHour) return `Hourly limit reached (${config.maxSendsPerHour} numbers an hour).`;
    if (day + credits > config.maxCreditsPerDay) return `Daily credit limit reached (${config.maxCreditsPerDay} credits a day).`;
    return null;
  }

  // 2026-11-09 15:35 +03: 0.2.0, Anthropic directory rules (read and write in separate tools; descriptions state facts only):
  // preview_sms is read-only and local, send_test_sms delivers nothing, send_sms is the live send. send_sms still
  // accepts the 0.1.x `mode` argument (preview, test) so older prompts keep working; it says so in its result.
  const NOTE_TEST = 'Test send: not delivered; its credits are held until you delete it from the Sending Queue in your kwtSMS account.';
  const NOTE_OLD = 'mode is from kwtsms-mcp 0.1; use preview_sms or send_test_sms.';

  function summaryOf(p, kind) {
    return {
      kind,
      sender: config.senderId,
      recipients: p.valid.map(mask),
      invalid: p.invalid.map((i) => ({ input: mask(i.input), error: i.error })),
      message: p.cleaned,
      encoding: p.seg.encoding,
      characters: p.seg.characters,
      parts_per_number: p.seg.parts,
      estimated_credits: p.credits,
    };
  }

  async function doSend(kind, { mobiles, message, client_ref: ref }, extraNote) {
    if (ref && refs.has(ref)) return text({ ...refs.get(ref), note: 'Already sent with this client_ref; not sent again.' });
    const p = prepare(mobiles, message);
    if (p.error) return fail(p.error);
    const summary = summaryOf(p, kind);
    if (p.valid.length === 0) return fail('No valid numbers to send to.');
    const blocked = capsBlock(p.valid.length, p.credits);
    if (blocked) return fail(blocked);
    const api = kind === 'live' ? liveClient : client;
    const r = await api.send(p.valid, p.cleaned, config.senderId);
    const ok = r && (r.result === 'OK' || r.result === 'PARTIAL');
    if (ok) sentLog.push({ at: now(), numbers: p.valid.length, credits: Number(r['points-charged'] ?? p.credits) });
    const note = [kind === 'test' ? NOTE_TEST : '', extraNote || ''].filter(Boolean).join(' ') || undefined;
    const out = {
      ...summary,
      sent: ok,
      result: r?.result,
      msg_id: r?.['msg-id'],
      credits_charged: r?.['points-charged'],
      balance_after: r?.['balance-after'],
      error: ok ? undefined : [r?.code, r?.description, r?.action].filter(Boolean).join(': '),
      note,
    };
    if (ok && ref) refs.set(ref, out);
    return ok ? text(out) : { isError: true, content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
  }

  const SEND_INPUT = {
    mobiles: { type: 'array', items: 'string', required: true, description: 'Phone numbers in international format, for example 965XXXXXXXX' },
    message: { type: 'string', required: true, description: 'SMS text, Arabic or English' },
  };
  const REF_INPUT = { client_ref: { type: 'string', description: 'Optional id for this send; a repeated id returns the first result and sends nothing' } };

  return {
    preview_sms: {
      title: 'Preview SMS',
      description:
        'Checks and normalizes the phone numbers, cleans the message, and counts SMS parts and credits. Sends nothing ' +
        'and makes no network call. Shows the Sender ID that sending uses.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      input: { ...SEND_INPUT },
      async handler({ mobiles, message }) {
        const p = prepare(mobiles, message);
        if (p.error) return fail(p.error);
        return text({ ...summaryOf(p, 'preview'), sent: false });
      },
    },

    send_test_sms: {
      title: 'Send test SMS',
      description:
        'Sends the SMS through kwtSMS in test mode (test=1): it is not delivered to any phone. Its credits are held ' +
        'until the message is deleted from the Sending Queue in the kwtSMS account. Hourly and daily limits apply.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      input: { ...SEND_INPUT, ...REF_INPUT },
      async handler(args) {
        return doSend('test', args);
      },
    },

    send_sms: {
      title: 'Send SMS',
      description:
        'Sends the SMS through kwtSMS to real phones and charges credits. Works only when the account owner switched ' +
        'live sending on (KWTSMS_MCP_ALLOW_LIVE) and requires confirm: true. The Sender ID is the one the owner set. ' +
        'Hourly and daily limits apply.',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      input: {
        ...SEND_INPUT,
        confirm: { type: 'boolean', description: 'Must be true to send' },
        ...REF_INPUT,
        mode: { type: 'string', enum: ['preview', 'test', 'live'], description: 'Deprecated (0.1.x): preview and test map to preview_sms and send_test_sms' },
      },
      async handler({ mode, confirm = false, ...args }) {
        if (mode === 'preview') {
          const p = prepare(args.mobiles, args.message);
          if (p.error) return fail(p.error);
          return text({ ...summaryOf(p, 'preview'), sent: false, note: NOTE_OLD });
        }
        if (mode === 'test') return doSend('test', args, NOTE_OLD);
        if (mode !== undefined && mode !== 'live') return fail('mode must be preview, test or live (deprecated; use the separate tools).');
        if (!config.allowLive || !liveClient) {
          return fail('Live sending is switched off by the account owner (KWTSMS_MCP_ALLOW_LIVE). send_test_sms sends without delivering.');
        }
        if (confirm !== true) return fail('Not sent: send_sms requires confirm: true.');
        return doSend('live', args);
      },
    },

    get_balance: {
      title: 'Get balance',
      description: 'Returns the credit balance of the kwtSMS account.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: {},
      async handler() {
        const [ok, balance, error] = await client.verify();
        return ok ? text({ balance }) : fail(`Could not read the balance: ${error}`);
      },
    },

    list_sender_ids: {
      title: 'List sender IDs',
      description: 'Lists the Sender IDs registered on the kwtSMS account and shows which one this server sends with.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: {},
      async handler() {
        const r = await client.senderids();
        return r?.result === 'OK' ? text({ sender_ids: r.senderids || [], configured: config.senderId }) : fail(`${r?.code}: ${r?.description}`);
      },
    },

    check_coverage: {
      title: 'Check coverage',
      description: 'Lists the country codes the kwtSMS account can send to, and the ones the account owner allows for this server.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: {},
      async handler() {
        const r = await client.coverage();
        if (r?.result !== 'OK') return fail(`${r?.code}: ${r?.description}`);
        const { result, ...rest } = r;
        return text({ ...rest, allowed_by_owner: config.allowedPrefixes });
      },
    },

    validate_numbers: {
      title: 'Validate numbers',
      description: 'Checks phone numbers with the kwtSMS API and returns them as valid, invalid or not covered. Sends nothing.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: { mobiles: { type: 'array', items: 'string', required: true, description: 'Phone numbers' } },
      async handler({ mobiles }) {
        if (!Array.isArray(mobiles) || mobiles.length === 0) return fail('Give at least one phone number.');
        if (mobiles.length > 200) return fail('At most 200 numbers per call.');
        const r = await client.validate(mobiles.map(String));
        const m = (list) => (Array.isArray(list) ? list.map((n) => mask(String(n))) : list);
        // 2026-11-09 15:35 +03: an API failure is an error result (review criteria: actionable errors)
        if (r?.error || r?.result === 'ERROR') return fail(`Could not validate: ${[r?.code, r?.description || r?.error].filter(Boolean).join(': ')}`);
        return text({ ok: m(r.ok), er: m(r.er), nr: m(r.nr), rejected: r.rejected });
      },
    },

    get_message_status: {
      title: 'Get message status',
      description: 'Returns the status of a sent message by its msg_id. Kuwait numbers have a send status, not a delivery report.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: { msg_id: { type: 'string', required: true, description: 'msg_id returned by send_sms or send_test_sms' } },
      async handler({ msg_id: id }) {
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id || ''))) return fail('msg_id looks wrong.');
        const r = await client.status(String(id));
        return r?.result === 'OK' ? text(r) : fail(`${r?.code}: ${r?.description}`);
      },
    },
  };
}
