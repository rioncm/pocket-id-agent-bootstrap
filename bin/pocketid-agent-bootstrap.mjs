#!/usr/bin/env node
import { parseArgs } from 'node:util';
import {
  bootstrapRuntimeCredential,
  extractToken,
  metadataPathFor,
  normalizeIssuer,
  privateKeyPathFor,
  redactSensitiveText,
  verifyRuntimeLogin
} from '../lib/pocketid-runtime.mjs';

function usage() {
  return `Usage:
  pocketid-agent-bootstrap register --issuer https://id.example.com --username vex --token <token> [options]
  pocketid-agent-bootstrap verify-login --issuer https://id.example.com --username vex --credential-id <id> [options]

Commands:
  register       Register a new PocketID runtime credential from a bootstrap token
  verify-login   Verify repeat runtime login with an existing private key

Register options:
  --credential-name <name>   Runtime credential label shown in PocketID
  --key-path <path>          Private key output path
  --metadata-path <path>     Non-secret metadata output path
  --skip-verify-login        Skip repeat-login verification
  --json                     Emit JSON

Verify-login options:
  --credential-id <id>       PocketID runtime credential ID
  --key-path <path>          Private key path
  --json                     Emit JSON

General:
  --help                     Show this help
`;
}

function parseCliArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'register';
  const args = command === argv[0] ? argv.slice(1) : argv;

  const { values } = parseArgs({
    args,
    options: {
      issuer: { type: 'string' },
      username: { type: 'string' },
      token: { type: 'string' },
      'credential-name': { type: 'string' },
      'credential-id': { type: 'string' },
      'key-path': { type: 'string' },
      'metadata-path': { type: 'string' },
      'skip-verify-login': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    },
    strict: true
  });

  if (values.help) {
    return { help: true };
  }
  if (!['register', 'verify-login'].includes(command)) {
    throw new Error(`unknown command: ${command}`);
  }
  if (!values.username) {
    throw new Error('--username is required');
  }

  const common = {
    command,
    issuer: normalizeIssuer(values.issuer),
    username: values.username,
    keyPath: values['key-path'] || privateKeyPathFor(values.username),
    json: values.json
  };

  if (command === 'verify-login') {
    if (!values['credential-id']) {
      throw new Error('--credential-id is required');
    }
    return {
      ...common,
      credentialId: values['credential-id']
    };
  }

  return {
    ...common,
    token: extractToken(values.token),
    credentialName: values['credential-name'] || 'Agent runtime',
    metadataPath: values['metadata-path'] || metadataPathFor(values.username),
    verifyLogin: !values['skip-verify-login']
  };
}

function printRegisterText(result, metadataPath) {
  process.stdout.write(
    [
      'PocketID runtime credential registered.',
      `Issuer: ${result.issuer}`,
      `Username: ${result.username}`,
      `Credential ID: ${result.credential.id}`,
      `Credential name: ${result.credential.name}`,
      `Private key: ${result.keyPath}`,
      `Metadata: ${metadataPath}`,
      `Repeat login verified: ${result.loginVerifiedAt ? 'yes' : 'skipped'}`
    ].join('\n') + '\n'
  );
}

function printVerifyText(result) {
  process.stdout.write(
    [
      'PocketID runtime credential login verified.',
      `Issuer: ${result.issuer}`,
      `Username: ${result.username}`,
      `Credential ID: ${result.credentialId}`,
      `Private key: ${result.keyPath}`,
      `Verified at: ${result.loginVerifiedAt}`
    ].join('\n') + '\n'
  );
}

async function main() {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }

    if (options.command === 'verify-login') {
      const result = await verifyRuntimeLogin(options);
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        printVerifyText(result);
      }
      return;
    }

    const result = await bootstrapRuntimeCredential(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      printRegisterText(result, options.metadataPath);
    }
  } catch (err) {
    const redacted = redactSensitiveText(err.message, [options?.token]);
    process.stderr.write(`Error: ${redacted}\n\n${usage()}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
