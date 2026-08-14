import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';

const DEFAULT_CREDENTIAL_NAME = 'Agent runtime';

export function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url');
}

export function normalizeIssuer(value) {
  if (!value) {
    throw new Error('issuer is required');
  }
  return value.replace(/\/+$/, '');
}

export function extractToken(value) {
  if (!value) {
    throw new Error('token is required');
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

export function resolveBootstrapOptions(input) {
  if (!input?.username) {
    throw new Error('username is required');
  }

  return {
    issuer: normalizeIssuer(input.issuer),
    username: input.username,
    token: extractToken(input.token),
    credentialName: input.credentialName || DEFAULT_CREDENTIAL_NAME,
    keyPath: resolve(input.keyPath || privateKeyPathFor(input.username)),
    metadataPath: resolve(input.metadataPath || metadataPathFor(input.username)),
    verifyLogin: input.verifyLogin !== false
  };
}

export function resolveVerifyOptions(input) {
  if (!input?.username) {
    throw new Error('username is required');
  }
  if (!input?.credentialId) {
    throw new Error('credentialId is required');
  }

  return {
    issuer: normalizeIssuer(input.issuer),
    username: input.username,
    credentialId: input.credentialId,
    keyPath: resolve(input.keyPath || privateKeyPathFor(input.username))
  };
}

export async function postJson(issuer, path, body) {
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

async function loadPrivateKey(keyPath) {
  const privatePem = await readFile(keyPath, 'utf8');
  return createPrivateKey(privatePem);
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
  await writeFile(keyPath, privatePem, { mode: 0o600, flag: 'wx' });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx'
  });
}

export async function verifyRuntimeLogin(input) {
  const options = resolveVerifyOptions(input);
  const privateKey = await loadPrivateKey(options.keyPath);

  const login = await postJson(options.issuer, '/api/runtime-credentials/login/start', {
    username: options.username,
    credentialId: options.credentialId
  });

  const user = await postJson(options.issuer, '/api/runtime-credentials/login/finish', {
    sessionId: login.sessionId,
    signature: signChallenge(privateKey, login.challenge)
  });

  return {
    issuer: options.issuer,
    username: options.username,
    credentialId: options.credentialId,
    keyPath: options.keyPath,
    loginVerifiedAt: new Date().toISOString(),
    user
  };
}

export async function bootstrapRuntimeCredential(input) {
  const options = resolveBootstrapOptions(input);
  await ensureOutputPathsAvailable(options.keyPath, options.metadataPath);

  const keypair = generateCredentialKeypair();
  const registration = await postJson(options.issuer, '/api/runtime-credentials/register/start', {
    token: options.token,
    name: options.credentialName,
    algorithm: 'Ed25519',
    publicKey: keypair.publicKey
  });

  const registered = await postJson(options.issuer, '/api/runtime-credentials/register/finish', {
    sessionId: registration.sessionId,
    signature: signChallenge(keypair.privateKey, registration.challenge)
  });

  const credential = registered.credential;
  if (!credential?.id) {
    throw new Error('registration response did not include credential.id');
  }

  let verification = null;
  if (options.verifyLogin) {
    const login = await postJson(options.issuer, '/api/runtime-credentials/login/start', {
      username: options.username,
      credentialId: credential.id
    });
    const user = await postJson(options.issuer, '/api/runtime-credentials/login/finish', {
      sessionId: login.sessionId,
      signature: signChallenge(keypair.privateKey, login.challenge)
    });
    verification = {
      loginVerifiedAt: new Date().toISOString(),
      user
    };
  }

  const metadata = {
    issuer: options.issuer,
    username: options.username,
    user: registered.user,
    credential,
    keyPath: options.keyPath,
    createdAt: new Date().toISOString(),
    loginVerifiedAt: verification?.loginVerifiedAt || null
  };

  await persistCredential({
    keyPath: options.keyPath,
    metadataPath: options.metadataPath,
    privatePem: keypair.privatePem,
    metadata
  });

  return metadata;
}

export function redactSensitiveText(text, secrets = []) {
  let output = String(text);
  for (const secret of secrets.filter(Boolean)) {
    output = output.split(secret).join('[REDACTED]');
  }
  return output;
}
