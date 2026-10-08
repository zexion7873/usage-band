# Security Policy

## Reporting a Vulnerability

**Do not open a public issue.** This repository *is* the marketplace people
install from, so a working exploit in a public issue is a working exploit
against every install that has already pulled.

Use [GitHub's private vulnerability reporting](https://github.com/zexion7873/usage-band/security/advisories/new).

This is a one-person project. You will get a first response within a few days,
not within hours, and the fix ships as a version bump in
`plugin/.claude-plugin/plugin.json` — nothing else reaches an install.

## Supported versions

The latest published version only. There are no maintenance branches, and tags
play no part: whatever `plugin/.claude-plugin/plugin.json` says on `main` is what
`claude plugin update` hands out, and older versions are never patched.

## What this plugin actually does on your machine

Worth knowing before you decide whether something is in scope. It is one mod
module run inside Claude Code's own engine. It:

- reads the session's usage — context fill, rate-limit windows, cost, and the
  context breakdown — through the engine's `$.session.usage()` and the
  `session.measure` event;
- keeps the latest figures in one plugin-state atom;
- draws them above the prompt: an SVG image per meter on the desktop, text in
  the terminal.

It makes no network requests, opens no ports, makes no model calls, runs no
shell commands and writes no files. `claude plugin validate plugin` prints every
engine call the module makes.

### Note for directory reviewers: the credential finding

The Anthropic directory's scan reports `MCP_FORWARDS_CREDENTIAL_ENV` for this
plugin by pairing two things that are not what the finding describes, and are
unrelated to each other:

- **"Reads the installer's tokens"** (`hooks/register.tsx`). The only tokens the
  mod reads are LLM usage counts — `context.tokens`, `input_tokens`,
  `cache_read_input_tokens`, `cache_creation_input_tokens`, and each context
  category's token count — returned by the engine's `$.session.usage()` and the
  `session.measure` event. It reads no
  credential, environment variable, or file.
- **"Sends data off the machine"** (`hooks/bar.ts`). `http://www.w3.org/2000/svg`
  is the SVG namespace in the `xmlns` attribute of the string the mod renders
  locally as each bar. It is an identifier and is never fetched.

The engine calls the module makes are exactly: `$.clock.every`, `$.clock.now`,
`$.session.usage`, `$.state.get`, `$.state.set`, `$.ui.invalidate`,
`$.ui.resolve`. None of them reaches the network.

### In scope

- Anything that lets content reach the SVG source. Only numbers and fixed
  colours are interpolated there today; context category names go into the
  tooltip text, never into the markup. A category name that escapes into the
  SVG is a vulnerability.
- Anything that makes the mod read or write outside its own plugin state, or
  call anything beyond what `validate` lists.
- Anything in the release path that could serve modified content to an install.

### Out of scope

- A figure that is wrong because Claude Code reported it wrong. The mod draws
  what the engine hands it.
- Anything requiring an attacker who can already write to your `~/.claude`
  directory or your plugin cache. At that point the band is not the problem.
