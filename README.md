<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/kwtsms/kwtsms-mcp/main/.github/assets/readme-header-dark.png">
  <img alt="kwtSMS: SMS gateway for Kuwait" src="https://raw.githubusercontent.com/kwtsms/kwtsms-mcp/main/.github/assets/readme-header-light.png">
</picture>

# kwtSMS MCP server

[![npm](https://img.shields.io/npm/v/kwtsms-mcp)](https://www.npmjs.com/package/kwtsms-mcp)
[![CI](https://github.com/kwtsms/kwtsms-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kwtsms/kwtsms-mcp/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.kwtsms%2Fkwtsms--mcp-blue)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Send SMS from your AI assistant, through kwtSMS, the Kuwaiti SMS gateway. Tell Claude, Cursor, VS Code or any MCP
client what to send and to whom, in English or Arabic: it writes the message, fixes the numbers, shows you the cost,
and sends when you say yes. Free and open source.

kwtSMS delivers to Zain, Ooredoo, stc and Virgin in Kuwait and to more than 200 countries, with your own Sender ID,
free API testing and credits that do not expire.

## What you can do with it

- **Market to your customers.** "Here is my customer list. Write a short Arabic offer for the weekend sale and send it
  to everyone." The assistant writes the text, removes duplicates and broken numbers, shows how many messages and
  credits it will use, and sends when you approve.
- **Notify customers.** "Text everyone in this sheet whose order is ready." "Remind everyone booked for tomorrow."
  "Send a payment reminder to the customers marked overdue." Your data, your words, no code.
- **Alert yourself.** "When the build finishes, text me." "If the tests fail, send me an SMS." An agent that runs on a
  schedule can text you the morning sales total or a server warning.
- **Write better messages.** Ask for a version that fits in one SMS, or an Arabic and an English version. Arabic fits
  70 characters in one SMS and English 160: the assistant counts it for you.
- **Run your account by asking.** "What is my balance?" "Which Sender IDs do I have?" "Can I send to Saudi numbers?"
  "Did my last message arrive?"
- **Build and test.** Developers try their SMS flows in test mode, straight from the editor, without delivering
  anything.

## Features

- **Plain language in, correct request out.** No code, no JSON, no API manual.
- **Numbers fixed for you.** Arabic and Persian digits, `+`, `00`, spaces and an extra `0` after the country code are
  corrected, duplicates removed, and invalid numbers listed with the reason before anything is sent. Same rules as our
  official [JavaScript library](https://github.com/kwtsms/kwtsms-js).
- **Clean messages.** Emoji, hidden characters and HTML that make a message fail or cost more are removed first.
- **Cost before sending.** Every send starts as a preview: numbers, SMS parts and credits.
- **Safe by default.** Live sending is off until you, the account owner, switch it on (see [Safety](#safety)).

## Tools

| Tool | What it does |
|---|---|
| `preview_sms` | Checks the numbers, cleans the message, counts SMS parts and credits. Sends nothing |
| `send_test_sms` | Test send (test=1): not delivered to any phone |
| `send_sms` | Real SMS to up to 10 numbers per call, only when live sending is on |
| `get_balance` | Your credit balance |
| `list_sender_ids` | Sender IDs on your account |
| `check_coverage` | Countries your account can send to |
| `validate_numbers` | Checks numbers without sending |
| `get_message_status` | Status of a sent message |

## Get started in 3 steps

1. **Open a free account** at https://www.kwtsms.com/cportal/signup/ (free test account, no papers).
2. **Copy your API username and API password** from the API Information page of your kwtSMS account. They are not
   your mobile number or your account login.
3. **Install** for your AI tool (below) and ask: "What is my kwtSMS balance?"

Your first sends run in test mode: they are not delivered, and nothing reaches a phone.

## Requirements

- A kwtSMS account (free test account, no papers): https://www.kwtsms.com/cportal/signup/
- Node.js 18 or newer (not needed for the Claude Desktop extension, which runs on the Node.js built into Claude
  Desktop)
- Any MCP client: Claude Desktop, Claude Code, Cursor, VS Code and others

## Installation

**Claude Desktop (easiest).** Download `kwtsms-mcp.mcpb` from the
[latest release](https://github.com/kwtsms/kwtsms-mcp/releases/latest) and open it with Claude Desktop (macOS or
Windows). An install window asks for your API username and password. Nothing else to install.

**Claude Code (easiest).** One command installs the kwtSMS plugin, which adds this server and a kwtSMS skill:

```bash
claude plugin install kwtsms --marketplace kwtsms/kwtsms-ai
```

Inside Claude Code: `/plugin install kwtsms --marketplace kwtsms/kwtsms-ai`, then `/plugin configure kwtsms@kwtsms` to
enter your API username and password. Needs Claude Code 2.1.292 or newer; older versions:
`claude plugin marketplace add kwtsms/kwtsms-ai`, then `claude plugin install kwtsms@kwtsms`.

Or add the server only:

```bash
claude mcp add kwtsms --env KWTSMS_USERNAME=your_api_username --env KWTSMS_PASSWORD=your_api_password \
  --env KWTSMS_SENDER_ID=YOUR-SENDER -- npx -y kwtsms-mcp
```

**Claude Desktop, by hand** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "kwtsms": {
      "command": "npx",
      "args": ["-y", "kwtsms-mcp"],
      "env": {
        "KWTSMS_USERNAME": "your_api_username",
        "KWTSMS_PASSWORD": "your_api_password",
        "KWTSMS_SENDER_ID": "YOUR-SENDER"
      }
    }
  }
}
```

**Cursor, VS Code and other MCP clients.** Add a server with the command `npx -y kwtsms-mcp` and the same environment
variables, in the MCP settings of your tool.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `KWTSMS_USERNAME`, `KWTSMS_PASSWORD` | required | kwtSMS API username and password |
| `KWTSMS_SENDER_ID` | `KWT-SMS` | Sender ID for every send (KWT-SMS is for testing only) |
| `KWTSMS_MCP_ALLOW_LIVE` | off | `1` or `true` allows live sending |
| `KWTSMS_MCP_MAX_NUMBERS` | 10 | Numbers per call |
| `KWTSMS_MCP_MAX_PER_HOUR` | 50 | Numbers per hour |
| `KWTSMS_MCP_MAX_CREDITS_PER_DAY` | 100 | Credits per day |
| `KWTSMS_MCP_ALLOWED_PREFIXES` | `965` | Allowed country codes, comma separated |
| `KWTSMS_LOG_FILE` | off | Log file of API calls (password masked) |

Sending to a bigger list? Raise the limits above. Run `npx -y kwtsms-mcp --help` for the same list.

## Safety

An AI model can be tricked by a web page or an email it reads. The server, not the model, enforces these rules:

- **Preview first.** `preview_sms` only checks the numbers and counts parts and credits; it makes no network call.
- **Test mode** (`send_test_sms`) sends with test=1: the message is never delivered, and its credits are held until you
  delete it from the Sending Queue in your kwtSMS account.
- **Live sending** (`send_sms`) works only when you set `KWTSMS_MCP_ALLOW_LIVE=1`. It is marked as an action that
  changes things, so your AI tool asks you before each real send.
- **Limits**: 10 numbers per call, 50 numbers an hour, 100 credits a day, Kuwait numbers only (change them in
  [Settings](#settings)).
- **Your Sender ID** is fixed in your settings; the model cannot choose another one.
- **No double sends**: a repeated `client_ref` returns the first result.
- **Protects your server's address**: repeated wrong-password calls from one address get that address blocked, so
  after a wrong password or another account error the server stops calling the API until you fix it and restart,
  instead of retrying in a loop. Calls are also sent one at a time, at a calm pace.
- Your password is never logged or shown, and phone numbers are masked in results.

Use a dedicated kwtSMS API user for AI tools, not your main login.

## Example

> "Send 'Your order is ready' to 965XXXXXXXX"

The assistant previews first: one number, 1 part, 1 credit, Sender ID YOUR-SENDER. You approve, and it sends in test
or live mode, as you allowed.

## Arabic

أرسل رسائل SMS من مساعد الذكاء الاصطناعي. اكتب لـ Claude أو Cursor أو أي برنامج يدعم MCP ما تريد إرساله ولمن، بالعربي
أو الإنجليزي، فيكتب الرسالة ويصحح الأرقام ويعرض لك عدد النقاط قبل الإرسال عبر kwtSMS.

- التسويق لعملائك: "هذه قائمة عملائي، اكتب عرضاً قصيراً بالعربي وأرسله للجميع".
- إشعار العملاء: طلب جاهز، تذكير بموعد، تذكير بالدفع، من جدولك مباشرة.
- تنبيهك أنت: "أرسل لي رسالة عندما ينتهي العمل" أو ملخص المبيعات كل صباح.
- إدارة حسابك بالسؤال: الرصيد، اسم المرسل، الدول المتاحة، حالة الرسالة.

البداية: افتح حساباً مجانياً على https://www.kwtsms.com/cportal/signup/ ثم انسخ اسم المستخدم وكلمة المرور من صفحة
تفاصيل البوابة في حسابك. الأرقام تُصحح تلقائياً (الأرقام العربية، 00، +، المسافات) وتُحذف المكررة. الوضع الافتراضي
معاينة فقط دون إرسال. الإرسال التجريبي لا يصل إلى الهاتف، وتبقى نقاطه محجوزة حتى تحذفه من طابور الارسال. الإرسال
الفعلي لا يعمل إلا إذا فعّله صاحب الحساب بالإعداد `KWTSMS_MCP_ALLOW_LIVE=1`.

## FAQ

**Which username do I use?** The API username and password from the API Information page of your kwtSMS account, not
your mobile number or account login.

**Why do test messages not arrive?** Test mode queues messages without delivering them. Set
`KWTSMS_MCP_ALLOW_LIVE=1` when you are ready to send for real.

**What is a Sender ID?** The name shown as the sender on the phone. See the
[Sender ID help](https://www.kwtsms.com/sender-id-help.html).

**Can the AI send without me?** Not by default. Live sending must be switched on by you, every live send needs a
confirmation, and the hourly and daily limits apply.

**The API stopped answering after a wrong password.** Repeated wrong-password calls from one address get that
address blocked. Fix the API username and password, then contact [kwtSMS support](https://www.kwtsms.com/support.html)
to unblock it.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Support

Help: https://www.kwtsms.com/support.html | FAQ: https://www.kwtsms.com/faq/ |
API: [developers](https://www.kwtsms.com/developers.html), [API reference](https://www.kwtsms.com/api-documentation.html) |
[Issues](https://github.com/kwtsms/kwtsms-mcp/issues)

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT, (c) kwtSMS (BoxLink Center).
