#!/usr/bin/env node
/**
 * FILE:      src/stdio.js
 * CREATED:   2026-11-08 17:05 +03
 * TASK:      new-int-w1-mcp
 * AUTHOR:    M Alhassoun
 * WHAT:      `kwtsms-mcp` command: runs the kwtSMS MCP server over stdio for Claude Desktop, Claude Code, Cursor and
 *            any MCP client. Settings come only from environment variables (see README).
 * WHY:       AI assistants start local MCP servers as a process and talk JSON-RPC over stdin/stdout.
 * USAGE:     KWTSMS_USERNAME=... KWTSMS_PASSWORD=... npx -y kwtsms-mcp     |    kwtsms-mcp --help
 * DEPENDS:   kwtsms, @modelcontextprotocol/sdk.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { KwtSMS } from 'kwtsms';
import { buildServer } from './server.js';
import { configFromEnv } from './core.js';
import { VERSION } from './version.js';

const HELP = `kwtsms-mcp ${VERSION}: kwtSMS SMS gateway as an MCP server (stdio).

Environment:
  KWTSMS_USERNAME, KWTSMS_PASSWORD   kwtSMS API username and password (required; use an API user, not your login)
  KWTSMS_SENDER_ID                   sender ID used for every send (default KWT-SMS, for testing only)
  KWTSMS_MCP_ALLOW_LIVE=1            allow mode "live" (real delivery); without it only preview and test work
  KWTSMS_MCP_MAX_NUMBERS             numbers per call (default 10)
  KWTSMS_MCP_MAX_PER_HOUR            numbers per hour (default 50)
  KWTSMS_MCP_MAX_CREDITS_PER_DAY     credits per day (default 100)
  KWTSMS_MCP_ALLOWED_PREFIXES        comma list of allowed country codes (default 965)
  KWTSMS_LOG_FILE                    JSONL log of API calls, password masked (default: no log)

Tools: send_sms, get_balance, list_sender_ids, check_coverage, validate_numbers, get_message_status.
`;

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (process.argv.includes('--version')) {
  process.stdout.write(VERSION + '\n');
  process.exit(0);
}

const config = configFromEnv();
if (!config.username || !config.password) {
  process.stderr.write('kwtsms-mcp: set KWTSMS_USERNAME and KWTSMS_PASSWORD (see kwtsms-mcp --help)\n');
  process.exit(1);
}
const options = { senderId: config.senderId, logFile: process.env.KWTSMS_LOG_FILE || '', appName: `kwtsms-mcp/${VERSION}` };
const client = new KwtSMS(config.username, config.password, { ...options, testMode: true });
const liveClient = config.allowLive ? new KwtSMS(config.username, config.password, { ...options, testMode: false }) : null;

const server = buildServer({ client, liveClient, config });
await server.connect(new StdioServerTransport());
