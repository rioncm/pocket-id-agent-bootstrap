import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(root, 'bin/pocketid-agent-bootstrap-mcp.mjs')],
  cwd: root,
  stderr: 'pipe'
});

const client = new Client({
  name: 'pocketid-agent-bootstrap-smoke-test',
  version: '0.1.0'
});

await client.connect(transport);

const tools = await client.listTools();
const toolNames = tools.tools.map((tool) => tool.name).sort();
assert.deepEqual(toolNames, ['explain_token', 'register_credential', 'verify_login']);

const explanation = await client.callTool({ name: 'explain_token', arguments: {} });
assert.match(explanation.content[0].text, /one-time secret/);

await client.close();
