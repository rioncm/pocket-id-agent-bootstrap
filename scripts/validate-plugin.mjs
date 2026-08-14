#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, '.codex-plugin/plugin.json');
const mcpPath = resolve(root, '.mcp.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

assert.equal(existsSync(manifestPath), true, 'missing .codex-plugin/plugin.json');
assert.equal(existsSync(mcpPath), true, 'missing .mcp.json');

const manifest = readJson(manifestPath);
assert.equal(manifest.name, 'pocketid-agent-bootstrap');
assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/);
assert.equal(manifest.mcpServers, './.mcp.json');
assert.equal(manifest.repository, 'https://git.vanness.me/vanness/pocketid-agent-bootstrap');
assert.equal(manifest.license, 'UNLICENSED');

for (const field of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
  assert.equal(typeof manifest.interface[field], 'string', `interface.${field} must be a string`);
  assert.notEqual(manifest.interface[field].trim(), '', `interface.${field} must not be empty`);
}

assert.equal(Array.isArray(manifest.interface.capabilities), true, 'interface.capabilities must be an array');
assert.equal(Array.isArray(manifest.interface.defaultPrompt), true, 'interface.defaultPrompt must be an array');

const mcp = readJson(mcpPath);
const server = mcp.mcpServers?.['pocketid-agent-bootstrap'];
assert.equal(server?.command, 'node');
assert.deepEqual(server?.args, ['./bin/pocketid-agent-bootstrap-mcp.mjs']);
assert.equal(existsSync(resolve(root, server.args[0])), true, 'configured MCP server script is missing');

console.log('plugin manifest validation passed');
