# kwtSMS MCP server

Send SMS from your AI assistant. Tell Claude, Cursor, VS Code or any MCP client what to send and to whom, in plain
English or Arabic; it writes the message, fixes the numbers, shows you the cost, and sends through
[kwtSMS](https://www.kwtsms.com), the SMS gateway in Kuwait. Safe by default: nothing reaches a phone until you, the
account owner, switch live sending on.

## What you can do with it

**Market to your customers.** "Here is my customer list. Write a short Arabic offer for the weekend sale and send it
to everyone." The assistant writes the text, removes duplicates and broken numbers, shows how many messages and credits
it will use, and sends when you say yes.

**Notify customers.** "Text everyone in this sheet whose order is ready." "Remind everyone booked for tomorrow."
"Send a payment reminder to the customers marked overdue." Your data, your words, no code.

**Alert yourself.** "When the build finishes, text me." "If the tests fail, send me an SMS." An agent that runs on a
schedule can text you the morning sales total or a server warning.

**Write better messages.** Ask for a shorter version that fits in one SMS, an Arabic and an English version, or the
cost before you commit. Arabic uses 70 characters per SMS and English 160: the assistant counts it for you.

**Run your account by asking.** "What is my balance?" "Which Sender IDs do I have?" "Can I send to Saudi numbers?"
"Did my last message arrive?"

**Build and test.** Developers test their SMS flows in test mode, without delivering anything, straight from the
editor.

## Why it is better than calling the API yourself

- **Plain language in, correct request out.** No code, no JSON, no API manual.
- **Numbers fixed for you.** Arabic and Persian digits, `+`, `00`, spaces and an extra `0` after the country code are
  corrected; duplicates are removed; invalid numbers are listed with the reason, before anything is sent. It uses the
  same rules as our official [JavaScript library](https://github.com/kwtsms/kwtsms-js).
- **Clean messages.** Emoji, hidden characters and HTML that make a message fail or cost more are removed first.
- **Cost before sending.** Every send starts as a preview: numbers, SMS parts, credits.
- **Guard rails you control.** Live sending off by default, confirmation for every live send, hourly and daily limits,
  allowed countries, your own Sender ID only. Raise the limits in the settings when you send to bigger lists.

## Tools

| Tool | What it does |
|---|---|
| `send_sms` | Preview (default), test or live send to up to 10 numbers |
| `get_balance` | Your credit balance |
| `list_sender_ids` | Sender IDs on your account |
| `check_coverage` | Countries your account can send to |
| `validate_numbers` | Checks numbers without sending |
| `get_message_status` | Status of a sent message |

## Safety

An AI model can be tricked by a web page or an email it reads. The server, not the model, enforces these rules:

- **Preview by default.** `send_sms` only checks the numbers and counts parts and credits.
- **Test mode** (`mode: "test"`) sends with test=1: the message is never delivered, and its credits are held until you
  delete it from the Queue in your kwtSMS account.
- **Live sending** works only when you set `KWTSMS_MCP_ALLOW_LIVE=1`, and every live send needs `confirm: true`.
- **Limits**: 10 numbers per call, 50 numbers an hour, 100 credits a day, Kuwait numbers only (change with the settings
  below).
- **Your Sender ID** is fixed in your settings; the model cannot choose another one.
- **No double sends**: a repeated `client_ref` returns the first result.
- Your password is never logged or shown, and phone numbers are masked in results.

Use a dedicated kwtSMS API user for AI tools, not your main login.

## Install

Needs Node.js 18 or newer. Get your API username and password from your kwtSMS account
([sign up](https://www.kwtsms.com/cportal/signup/)).

**Claude Desktop, easiest:** download `kwtsms-mcp.mcpb` from the [latest release](https://github.com/kwtsms/kwtsms-mcp/releases/latest) and open it with Claude Desktop (macOS or Windows). An install window opens and asks for your API username and password; nothing else to install.

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

**Claude Code**:

```bash
claude mcp add kwtsms --env KWTSMS_USERNAME=your_api_username --env KWTSMS_PASSWORD=your_api_password \
  --env KWTSMS_SENDER_ID=YOUR-SENDER -- npx -y kwtsms-mcp
```

**Cursor, VS Code and other clients**: the same command (`npx -y kwtsms-mcp`) and environment variables.

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

Run `npx -y kwtsms-mcp --help` for the same list.

## Example

> "Send 'Your order is ready' to 965XXXXXXXX"

The assistant previews first: one number, 1 part, 1 credit, Sender ID YOUR-SENDER. You approve, it sends in test or
live mode as you allowed.

## بالعربي

أرسل رسائل SMS من مساعد الذكاء الاصطناعي. اكتب لـ Claude أو Cursor أو أي برنامج يدعم MCP ما تريد إرساله ولمن، بالعربي
أو الإنجليزي، فيكتب الرسالة ويصحح الأرقام ويعرض لك عدد النقاط قبل الإرسال عبر kwtSMS.

أمثلة:
- التسويق لعملائك: "هذه قائمة عملائي، اكتب عرضاً قصيراً بالعربي وأرسله للجميع".
- إشعار العملاء: طلب جاهز، تذكير بموعد، تذكير بالدفع، من جدولك مباشرة.
- تنبيهك أنت: "أرسل لي رسالة عندما ينتهي العمل" أو ملخص المبيعات كل صباح.
- إدارة حسابك بالسؤال: الرصيد، اسم المرسل، الدول المتاحة، حالة الرسالة.

الأرقام تُصحح تلقائياً (الأرقام العربية، 00، +، المسافات) وتُحذف المكررة، والرسالة تُنظف من الرموز التي ترفع التكلفة.
الوضع الافتراضي معاينة فقط دون إرسال. الإرسال التجريبي لا يصل إلى الهاتف، وتبقى نقاطه محجوزة حتى تحذفه من طابور
الارسال. الإرسال الفعلي لا يعمل إلا إذا فعّله صاحب الحساب بالإعداد `KWTSMS_MCP_ALLOW_LIVE=1`.

## Support

[kwtsms.com/support.html](https://www.kwtsms.com/support.html). Security reports: see [SECURITY.md](SECURITY.md).

## License

MIT
