/**
 * FILE:      src/version.js
 * CREATED:   2026-11-08 17:05 +03
 * TASK:      new-int-w1-mcp
 * AUTHOR:    M Alhassoun
 * WHAT:      The package version, one place (also used in the User-Agent token kwtsms-mcp/<version>).
 * WHY:       package.json, server.json and the MCP server info must agree; test/version.test.js checks it.
 * USAGE:     import { VERSION } from './version.js'
 * DEPENDS:   nothing.
 */
// 2026-11-09 10:07 +03: 0.1.1, Claude Desktop bundle (.mcpb)
// 2026-11-09 12:17 +03: 0.1.2, new README on npm; first release by npm trusted publishing
// 2026-11-09 15:36 +03: 0.2.0, separate preview, test and live send tools (Anthropic directory rules)
// 2026-11-09 16:22 +03: 0.2.1, reads Claude plugin option names
export const VERSION = '0.2.1';
