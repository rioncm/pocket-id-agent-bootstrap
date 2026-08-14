import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64UrlDecode,
  defaultCredentialDir,
  extractToken,
  metadataPathFor,
  normalizeIssuer,
  privateKeyPathFor,
  resolveBootstrapOptions,
  resolveVerifyOptions
} from '../lib/pocketid-runtime.mjs';

describe('PocketID bootstrap helpers', () => {
  it('extracts a token from a PocketID one-time-code URL', () => {
    assert.equal(extractToken('https://id.vanness.me/lc/dkektfNxDYXDbEMy'), 'dkektfNxDYXDbEMy');
  });

  it('leaves a raw token alone', () => {
    assert.equal(extractToken('raw-bootstrap-token'), 'raw-bootstrap-token');
  });

  it('normalizes issuer URLs without trailing slashes', () => {
    assert.equal(normalizeIssuer('https://id.vanness.me///'), 'https://id.vanness.me');
  });

  it('decodes unpadded base64url challenges', () => {
    assert.deepEqual(base64UrlDecode('aGVsbG8'), Buffer.from('hello'));
  });

  it('uses filesystem-safe default credential paths', () => {
    const dir = defaultCredentialDir('vex@example.com');
    assert.match(dir, /vex_example\.com$/);
    assert.match(privateKeyPathFor('vex@example.com'), /ed25519-private\.pem$/);
    assert.match(metadataPathFor('vex@example.com'), /metadata\.json$/);
  });

  it('resolves bootstrap options with verification enabled by default', () => {
    const options = resolveBootstrapOptions({
      issuer: 'https://id.vanness.me/',
      username: 'vex',
      token: 'https://id.vanness.me/lc/abc',
      credentialName: 'Vex runtime'
    });

    assert.equal(options.issuer, 'https://id.vanness.me');
    assert.equal(options.token, 'abc');
    assert.equal(options.verifyLogin, true);
  });

  it('requires credential ID for verify-login options', () => {
    assert.throws(
      () => resolveVerifyOptions({ issuer: 'https://id.vanness.me', username: 'vex' }),
      /credentialId is required/
    );
  });
});
