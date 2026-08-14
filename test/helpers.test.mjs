import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64UrlDecode,
  defaultCredentialDir,
  extractToken,
  metadataPathFor,
  normalizeIssuer,
  privateKeyPathFor
} from '../bin/pocketid-agent-bootstrap.mjs';

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
});
