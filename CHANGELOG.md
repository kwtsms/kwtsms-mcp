# Changelog

## [0.1.2] - 2026-11-09

### Fixed
- Protects your server's address from the kwtSMS firewall: API calls are spaced (at most 7 in 10 seconds), and after a wrong password or another account error the server stops calling until you fix it and restart.

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
