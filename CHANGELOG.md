# Changelog

## [0.2.1] - 2026-11-09

### Changed
- Also reads its settings from the standard Claude plugin option names, so the kwtSMS plugin for Claude passes settings the way Anthropic recommends.

## [0.2.0] - 2026-11-09

### Changed
- Three tools instead of one for sending: preview_sms (checks numbers, parts and credits, sends nothing), send_test_sms (not delivered) and send_sms (real SMS, only when live sending is on). Clients can now ask before real sends only.
- send_sms still accepts the old mode setting (preview, test) from 0.1.
- Clearer tool descriptions; a failed number check is reported as an error.

## [0.1.2] - 2026-11-09

### Fixed
- Protects your server's address: after a wrong password or another account error the server stops calling the API until you fix it and restart (repeated wrong-password calls get an address blocked). Calls are sent one at a time, at a calm pace.

### Changed
- New README: what you can do with it, a 3-step start and install steps for each AI tool.
- Releases are published from GitHub without a stored npm token.

## [0.1.1] - 2026-11-09

### Added
- Claude Desktop extension: download kwtsms-mcp.mcpb from the GitHub release and open it with Claude Desktop to install; it asks for your API username and password and stores the password securely.

## [0.1.0] - 2026-11-08

### Added
- First release: kwtSMS as an MCP server for AI assistants.
- Tools to send SMS, read the balance, list Sender IDs, check coverage, validate numbers and read message status.
- Safe by default: preview and test mode only until the account owner allows live sending; send limits.
