/**
 * FILE:      src/server.js
 * CREATED:   2026-11-08 17:05 +03
 * TASK:      new-int-w1-mcp
 * AUTHOR:    M Alhassoun
 * WHAT:      Builds the MCP server: registers every tool from src/core.js with its input schema and annotations.
 * WHY:       Shared by the stdio entry (src/stdio.js) and a later Streamable HTTP entry.
 * USAGE:     const server = buildServer({ client, liveClient, config }); await server.connect(transport)
 * DEPENDS:   @modelcontextprotocol/sdk, zod.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// 2026-11-17 23:59 +03: public brand icon (same file as the kwtSMS Claude plugin icon), job 80
export const ICON_URL = 'https://raw.githubusercontent.com/kwtsms/kwtsms-ai/main/plugins/kwtsms/assets/kwtsms-icon.png';
import { z } from 'zod';
import { createTools } from './core.js';
import { VERSION } from './version.js';

/** Turns the plain input description in core.js into a zod shape for the SDK. */
function toZod(input) {
  const shape = {};
  for (const [name, spec] of Object.entries(input)) {
    let t;
    if (spec.type === 'array') t = z.array(z.string());
    else if (spec.type === 'boolean') t = z.boolean();
    else if (spec.enum) t = z.enum(spec.enum);
    else t = z.string();
    t = t.describe(spec.description || name);
    shape[name] = spec.required ? t : t.optional();
  }
  return shape;
}

export function buildServer({ client, liveClient, config, now }) {
  // 2026-11-17 23:59 +03: brand icon, title and website in serverInfo (MCP 2025-11-25 icons), so clients that render
  // server icons show the kwtSMS logo; Boss voice 1220, workqueue job 80
  const server = new McpServer({
    name: 'kwtsms',
    title: 'kwtSMS',
    version: VERSION,
    websiteUrl: 'https://www.kwtsms.com',
    icons: [{ src: ICON_URL, mimeType: 'image/png', sizes: ['192x192'] }],
  });
  const tools = createTools({ client, liveClient, config, now });
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(
      name,
      { title: tool.title, description: tool.description, inputSchema: toZod(tool.input), annotations: tool.annotations },
      async (args) => {
        try {
          return await tool.handler(args || {});
        } catch (e) {
          // never echo request bodies: they carry the API password
          return { isError: true, content: [{ type: 'text', text: `kwtSMS tool failed: ${e?.message || 'unknown error'}` }] };
        }
      },
    );
  }
  return server;
}
