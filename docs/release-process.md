# Packaging And Release Process

This repo ships three compatibility layers:

- Node library in `lib/`
- shell CLI in `bin/pocketid-agent-bootstrap.mjs`
- stdio MCP server in `bin/pocketid-agent-bootstrap-mcp.mjs`

The Codex plugin manifest lives at `.codex-plugin/plugin.json` and points to `.mcp.json`.

Automation exists for both internal Gitea and future public GitHub mirrors:

- `.gitea/workflows/ci.yml`
- `.gitea/workflows/release.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/dependabot.yml`

## Versioning

Use semver:

- patch: bug fixes and docs
- minor: new tools, new non-breaking options
- major: breaking CLI, MCP, or metadata changes

Keep `package.json`, `.codex-plugin/plugin.json`, and MCP `serverInfo.version` aligned.

## Pre-Release Checklist

1. Run tests:

   ```bash
   npm test
   ```

2. Verify CLI help:

   ```bash
   node bin/pocketid-agent-bootstrap.mjs --help
   ```

3. Smoke-test MCP tool discovery:

   ```bash
   node test/mcp-smoke.mjs
   ```

4. Validate the plugin manifest:

   ```bash
   npm run validate:plugin
   ```

5. Validate with the Codex plugin validator when available.

6. Run one end-to-end registration against a disposable PocketID agent bootstrap token.

## Release

1. Update versions.
2. Commit:

   ```bash
   git commit -am "Release vX.Y.Z"
   ```

3. Tag:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   ```

4. Push branch and tag:

   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```

5. The Gitea and GitHub release workflows publish source archives and release notes from matching tags.

For public GitHub publication, push `main` and the version tag to the GitHub remote. GitHub Actions will run the same test/validation gate on pull requests, pushes, and tags.

Before the first public GitHub release, update `.codex-plugin/plugin.json` if the public repository URL differs from the internal Gitea URL.

## Agent Host Notes

For shell-native agents, install or run the package CLI.

For MCP-capable agents, configure the stdio server:

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

For Codex, install the plugin from the repo or a marketplace entry that points at this plugin root.
