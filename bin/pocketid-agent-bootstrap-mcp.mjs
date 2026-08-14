#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  bootstrapRuntimeCredential,
  redactSensitiveText,
  verifyRuntimeLogin
} from '../lib/pocketid-runtime.mjs';

const server = new McpServer({
  name: 'pocketid-agent-bootstrap',
  version: '0.2.0'
});

function textResult(value) {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      }
    ]
  };
}

function toolError(error, secrets = []) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: redactSensitiveText(error.message, secrets)
      }
    ]
  };
}

server.registerTool(
  'register_credential',
  {
    title: 'Register PocketID Runtime Credential',
    description:
      'Register a PocketID runtime credential from an agent bootstrap token. Never opens /lc links in a browser.',
    inputSchema: {
      issuer: z.string().url().describe('PocketID issuer URL, for example https://id.vanness.me'),
      username: z.string().min(1).describe('PocketID username'),
      token: z.string().min(1).describe('Raw bootstrap token or /lc/<token> URL'),
      credentialName: z.string().min(1).optional().describe('Runtime credential display name'),
      keyPath: z.string().optional().describe('Private key output path'),
      metadataPath: z.string().optional().describe('Metadata output path'),
      verifyLogin: z.boolean().optional().describe('Verify repeat login after registration')
    }
  },
  async (args) => {
    try {
      return textResult(await bootstrapRuntimeCredential(args));
    } catch (err) {
      return toolError(err, [args.token]);
    }
  }
);

server.registerTool(
  'verify_login',
  {
    title: 'Verify PocketID Runtime Login',
    description: 'Verify a PocketID runtime credential can still authenticate with the stored private key.',
    inputSchema: {
      issuer: z.string().url().describe('PocketID issuer URL'),
      username: z.string().min(1).describe('PocketID username'),
      credentialId: z.string().uuid().describe('PocketID runtime credential ID'),
      keyPath: z.string().optional().describe('Private key path')
    }
  },
  async (args) => {
    try {
      return textResult(await verifyRuntimeLogin(args));
    } catch (err) {
      return toolError(err);
    }
  }
);

server.registerTool(
  'explain_token',
  {
    title: 'Explain PocketID Agent Token',
    description: 'Explain how an agent should handle a PocketID bootstrap token without consuming it.',
    inputSchema: {
      tokenForm: z.string().optional().describe('Optional token shape or example, not required')
    }
  },
  async () =>
    textResult(
      [
        'A PocketID agent bootstrap token is a one-time secret for registering a runtime credential.',
        'Do not open /lc/<token> in a browser; the normal one-time login flow can consume it.',
        'Use register_credential so the agent generates an Ed25519 key locally, sends only the public key, signs the challenge, and verifies repeat login.'
      ].join('\n')
    )
);

const transport = new StdioServerTransport();
await server.connect(transport);
