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
export function configFromEnv(env = process.env) {
  const int = (v, d) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    username: env.KWTSMS_USERNAME || '',
    password: env.KWTSMS_PASSWORD || '',
    senderId: env.KWTSMS_SENDER_ID || 'KWT-SMS',
    allowLive: ['1', 'true'].includes(String(env.KWTSMS_MCP_ALLOW_LIVE || '').toLowerCase()), // 2026-11-08 18:07 +03: 'true' from Claude Code plugin settings
    maxNumbersPerCall: int(env.KWTSMS_MCP_MAX_NUMBERS, 10),
    maxSendsPerHour: int(env.KWTSMS_MCP_MAX_PER_HOUR, 50),
    maxCreditsPerDay: int(env.KWTSMS_MCP_MAX_CREDITS_PER_DAY, 100),
    allowedPrefixes: (env.KWTSMS_MCP_ALLOWED_PREFIXES || '965').split(',').map((s) => s.trim()).filter(Boolean),
  };
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

  return {
    send_sms: {
      title: 'Send SMS',
      description:
        'Send an SMS through kwtSMS. mode "preview" (default) only checks numbers and counts parts and credits, nothing ' +
        'is sent. mode "test" sends with test=1: never delivered, credits held until it is deleted from the Queue in ' +
        'the kwtSMS account. mode "live" delivers to real phones and costs credits: only works when the account owner enabled live ' +
        'sending, and needs confirm=true after the user has seen the preview. The sender ID is fixed by the owner.',
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: false },
      input: {
        mobiles: { type: 'array', items: 'string', required: true, description: 'Phone numbers in international format, e.g. 965XXXXXXXX' },
        message: { type: 'string', required: true, description: 'SMS text (Arabic or English)' },
        mode: { type: 'string', enum: ['preview', 'test', 'live'], description: 'preview (default), test or live' },
        confirm: { type: 'boolean', description: 'Must be true for mode live' },
        client_ref: { type: 'string', description: 'Optional id for this send; repeating it returns the first result instead of sending again' },
      },
      async handler({ mobiles, message, mode = 'preview', confirm = false, client_ref: ref }) {
        if (ref && refs.has(ref)) return text({ ...refs.get(ref), note: 'Already sent with this client_ref; not sent again.' });
        const p = prepare(mobiles, message);
        if (p.error) return fail(p.error);
        const summary = {
          mode,
          sender: config.senderId,
          recipients: p.valid.map(mask),
          invalid: p.invalid.map((i) => ({ input: mask(i.input), error: i.error })),
          message: p.cleaned,
          encoding: p.seg.encoding,
          characters: p.seg.characters,
          parts_per_number: p.seg.parts,
          estimated_credits: p.credits,
        };
        if (mode === 'preview') return text({ ...summary, sent: false });
        if (p.valid.length === 0) return fail('No valid numbers to send to.');
        if (mode === 'live') {
          if (!config.allowLive || !liveClient) {
            return fail('Live sending is switched off by the account owner (KWTSMS_MCP_ALLOW_LIVE). Use mode "test".');
          }
          if (confirm !== true) return fail('Live sending needs confirm=true after the user has approved the preview.');
        } else if (mode !== 'test') return fail('mode must be preview, test or live.');
        const blocked = capsBlock(p.valid.length, p.credits);
        if (blocked) return fail(blocked);
        const api = mode === 'live' ? liveClient : client;
        const r = await api.send(p.valid, p.cleaned, config.senderId);
        const ok = r && (r.result === 'OK' || r.result === 'PARTIAL');
        if (ok) sentLog.push({ at: now(), numbers: p.valid.length, credits: Number(r['points-charged'] ?? p.credits) });
        const out = {
          ...summary,
          sent: ok,
          result: r?.result,
          msg_id: r?.['msg-id'],
          credits_charged: r?.['points-charged'],
          balance_after: r?.['balance-after'],
          error: ok ? undefined : [r?.code, r?.description, r?.action].filter(Boolean).join(': '),
          note: mode === 'test' ? 'Test send: not delivered; its credits are held until you delete it from the Queue in your kwtSMS account.' : undefined,
        };
        if (ok && ref) refs.set(ref, out);
        return ok ? text(out) : { isError: true, content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
      },
    },

    get_balance: {
      title: 'Get balance',
      description: 'Current kwtSMS credit balance of the account.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: {},
      async handler() {
        const [ok, balance, error] = await client.verify();
        return ok ? text({ balance }) : fail(`Could not read the balance: ${error}`);
      },
    },

    list_sender_ids: {
      title: 'List sender IDs',
      description: 'Sender IDs registered on the account. Sending always uses the one the owner configured.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: {},
      async handler() {
        const r = await client.senderids();
        return r?.result === 'OK' ? text({ sender_ids: r.senderids || [], configured: config.senderId }) : fail(`${r?.code}: ${r?.description}`);
      },
    },

    check_coverage: {
      title: 'Check coverage',
      description: 'Country prefixes the account can send to.',
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
      description: 'Checks phone numbers with kwtSMS (valid, invalid, not covered) without sending anything.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: { mobiles: { type: 'array', items: 'string', required: true, description: 'Phone numbers' } },
      async handler({ mobiles }) {
        if (!Array.isArray(mobiles) || mobiles.length === 0) return fail('Give at least one phone number.');
        if (mobiles.length > 200) return fail('At most 200 numbers per call.');
        const r = await client.validate(mobiles.map(String));
        const m = (list) => (Array.isArray(list) ? list.map((n) => mask(String(n))) : list);
        return text({ ok: m(r.ok), er: m(r.er), nr: m(r.nr), rejected: r.rejected, error: r.error });
      },
    },

    get_message_status: {
      title: 'Get message status',
      description: 'Status of a sent message by its msg_id.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      input: { msg_id: { type: 'string', required: true, description: 'msg_id returned by send_sms' } },
      async handler({ msg_id: id }) {
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id || ''))) return fail('msg_id looks wrong.');
        const r = await client.status(String(id));
        return r?.result === 'OK' ? text(r) : fail(`${r?.code}: ${r?.description}`);
      },
    },
  };
}
