# PocketID Agent Bootstrap

Companion helper for agent frameworks that receive a PocketID agent bootstrap token.

PocketID should provide identity authority. Agent runtimes should know how to turn a one-time bootstrap token into a locally held runtime credential without opening browser login links.

This project provides a packageable integration for that flow:

- reusable Node library
- shell CLI
- stdio MCP server
- Codex plugin manifest

## What It Does

`pocketid-agent-bootstrap`:

- generates a local Ed25519 keypair
- sends only the raw public key to PocketID
- signs PocketID's one-time registration challenge locally
- stores the private key in a protected local file
- writes non-secret credential metadata beside it
- verifies repeat runtime login by default

It never sends the private key to PocketID.

## CLI Usage

```bash
pocketid-agent-bootstrap \
  register \
  --issuer https://id.vanness.me \
  --username vex \
  --token '<agent-bootstrap-token>' \
  --credential-name 'Vex OpenClaw main runtime'
```

By default, credentials are written under:

```text
~/.openclaw/credentials/pocketid-runtime/<username>/
```

Override paths when a framework has its own protected credential store:

```bash
pocketid-agent-bootstrap \
  register \
  --issuer https://id.vanness.me \
  --username vex \
  --token '<agent-bootstrap-token>' \
  --credential-name 'Vex OpenClaw main runtime' \
  --key-path ~/.openclaw/credentials/pocketid-vex-runtime/ed25519-private.pem \
  --metadata-path ~/.openclaw/credentials/pocketid-vex-runtime/metadata.json
```

Verify an existing credential:

```bash
pocketid-agent-bootstrap \
  verify-login \
  --issuer https://id.vanness.me \
  --username vex \
  --credential-id '<credential-id>' \
  --key-path ~/.openclaw/credentials/pocketid-vex-runtime/ed25519-private.pem
```

## MCP Usage

Run the stdio MCP server:

```bash
pocketid-agent-bootstrap-mcp
```

Or configure an MCP-capable agent host:

```json
{
  "mcpServers": {
    "pocketid-agent-bootstrap": {
      "command": "node",
      "args": ["/path/to/pocketid-agent-bootstrap/bin/pocketid-agent-bootstrap-mcp.mjs"]
    }
  }
}
```

Tools:

- `register_credential`
- `verify_login`
- `explain_token`

## Codex Plugin

The Codex plugin manifest is at `.codex-plugin/plugin.json`.

It exposes the MCP server through `.mcp.json`. The OpenClaw skill content is managed through Skill Workshop rather than committed directly here.

## Agent Skill Contract

When an agent receives a PocketID agent bootstrap token:

1. Do not open it as a browser link.
2. Treat it as a one-time secret.
3. Use the PocketID runtime credential registration endpoints directly.
4. Generate the signing key locally.
5. Store only the private key locally, protected by filesystem permissions or a framework secret store.
6. Verify repeat login before declaring onboarding complete.

## Token Inputs

The helper accepts either the raw token or a `/lc/<token>` URL. The URL form is accepted only as an input convenience; the helper extracts the token and does not call the normal one-time login exchange endpoint.

## Development

```bash
npm test
```

No runtime npm dependencies are required.

See [docs/release-process.md](docs/release-process.md) for packaging and release steps.
