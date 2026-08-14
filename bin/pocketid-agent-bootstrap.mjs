#!/usr/bin/env node
import { constants, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { parseArgs } from 'node:util';

const DEFAULT_CREDENTIAL_NAME = 'Agent runtime';

export function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url');
}

export function normalizeIssuer(value) {
  if (!value) {
    throw new Error('--issuer is required');
  }
  return value.replace(/\/+$/, '');
}

export function extractToken(value) {
  if (!value) {
    throw new Error('--token is required');
  }
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/lc\/([^/]+)$/);
    if (match) {
      return match[1];
    }
  } catch {
    // Not a URL; use the raw token below.
  }
  return value;
}

export function defaultCredentialDir(username) {
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return join(homedir(), '.openclaw', 'credentials', 'pocketid-runtime', safeUsername);
}

export function privateKeyPathFor(username) {
  return join(defaultCredentialDir(username), 'ed25519-private.pem');
}

export function metadataPathFor(username) {
  return join(defaultCredentialDir(username), 'metadata.json');
}

function usage() {
  return `Usage:
  pocketid-agent-bootstrap --issuer https://id.example.com --username vex --token <token> [options]

Options:
  --credential-name <name>   Runtime credential label shown in PocketID
  --key-path <path>          Private key output path
  --metadata-path <path>     Non-secret metadata output path
  --skip-verify-login        Skip repeat-login verification
  --help                     Show this help
`;
}

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      issuer: { type: 'string' },
      username: { type: 'string' },
      token: { type: 'string' },
      'credential-name': { type: 'string' },
      'key-path': { type: 'string' },
      'metadata-path': { type: 'string' },
      'skip-verify-login': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    },
    strict: true
  });

  if (values.help) {
    return { help: true };
  }

  if (!values.username) {
    throw new Error('--username is required');
  }

  return {
    issuer: normalizeIssuer(values.issuer),
    username: values.username,
    token: extractToken(values.token),
    credentialName: values['credential-name'] || DEFAULT_CREDENTIAL_NAME,
    keyPath: resolve(values['key-path'] || privateKeyPathFor(values.username)),
    metadataPath: resolve(values['metadata-path'] || metadataPathFor(values.username)),
    verifyLogin: !values['skip-verify-login']
  };
}

async function postJson(issuer, path, body) {
  const res = await fetch(`${issuer}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${path} returned non-JSON response (${res.status}): ${text.slice(0, 300)}`);
    }
  }

  if (!res.ok) {
    const detail = json?.message || json?.error || text || res.statusText;
    throw new Error(`${path} failed (${res.status}): ${detail}`);
  }

  return json;
}

function generateCredentialKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });

  if (!publicJwk.x) {
    throw new Error('Node did not return an Ed25519 public JWK x coordinate');
  }

  return { privateKey, privatePem, publicKey: publicJwk.x };
}

function signChallenge(privateKey, encodedChallenge) {
  return sign(null, base64UrlDecode(encodedChallenge), privateKey).toString('base64url');
}

async function ensureOutputPathsAvailable(keyPath, metadataPath) {
  if (existsSync(keyPath)) {
    throw new Error(`refusing to overwrite existing private key: ${keyPath}`);
  }
  if (existsSync(metadataPath)) {
    throw new Error(`refusing to overwrite existing metadata: ${metadataPath}`);
  }

  await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 });
  await mkdir(dirname(metadataPath), { recursive: true, mode: 0o700 });
}

async function persistCredential({ keyPath, metadataPath, privatePem, metadata }) {
  await writeFile(keyPath, privatePem, { mode: 0o600, flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
    flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
  });
}

export async function bootstrapRuntimeCredential(options) {
  const { issuer, username, token, credentialName, keyPath, metadataPath, verifyLogin } = options;
  await ensureOutputPathsAvailable(keyPath, metadataPath);

  const keypair = generateCredentialKeypair();
  const registration = await postJson(issuer, '/api/runtime-credentials/register/start', {
    token,
    name: credentialName,
    algorithm: 'Ed25519',
    publicKey: keypair.publicKey
  });

  const registered = await postJson(issuer, '/api/runtime-credentials/register/finish', {
    sessionId: registration.sessionId,
    signature: signChallenge(keypair.privateKey, registration.challenge)
  });

  const credential = registered.credential;
  if (!credential?.id) {
    throw new Error('registration response did not include credential.id');
  }

  let loginVerifiedAt = null;
  if (verifyLogin) {
    const login = await postJson(issuer, '/api/runtime-credentials/login/start', {
      username,
      credentialId: credential.id
    });
    await postJson(issuer, '/api/runtime-credentials/login/finish', {
      sessionId: login.sessionId,
      signature: signChallenge(keypair.privateKey, login.challenge)
    });
    loginVerifiedAt = new Date().toISOString();
  }

  const metadata = {
    issuer,
    username,
    user: registered.user,
    credential,
    keyPath,
    createdAt: new Date().toISOString(),
    loginVerifiedAt
  };

  await persistCredential({
    keyPath,
    metadataPath,
    privatePem: keypair.privatePem,
    metadata
  });

  return metadata;
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }

    const result = await bootstrapRuntimeCredential(options);
    process.stdout.write(
      [
        'PocketID runtime credential registered.',
        `Issuer: ${result.issuer}`,
        `Username: ${result.username}`,
        `Credential ID: ${result.credential.id}`,
        `Credential name: ${result.credential.name}`,
        `Private key: ${result.keyPath}`,
        `Metadata: ${options.metadataPath}`,
        `Repeat login verified: ${result.loginVerifiedAt ? 'yes' : 'skipped'}`
      ].join('\n') + '\n'
    );
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n\n${usage()}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
