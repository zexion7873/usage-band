# usage-band — install guide for AI agents

usage-band is a Claude Code mod (a plugin of function hooks): an always-on band
above the prompt showing context fill and every rate-limit window, in the
desktop app's Code tab and in the terminal. Follow these steps to install it on
the user's machine.

## 1. Preflight

```bash
claude --version
```

The mod needs a Claude Code build with function-hook plugins. CI validates and
tests it against 2.1.291; older builds are unmeasured. If the user's version is
older, tell them so and suggest updating Claude Code first — do not install
and hope.

## 2. Install

The `/plugin` commands in the README are REPL slash commands and won't work
from a shell — use the CLI:

```bash
claude plugin marketplace add zexion7873/usage-band
claude plugin install usage-band@usage-band
```

`install` defaults to the user scope, which is the one that also reaches
sessions the desktop app starts. Do not pass `--scope project` or `local`
unless the user asked for it.

If these fail on a machine where Claude Code has never been run interactively,
have the user launch `claude` once first, then retry.

## 3. Verify

```bash
claude plugin list | grep -i -A3 usage-band
```

Look for `usage-band@usage-band` with `Status: ✔ loaded`. Nothing to
configure.

A session gains a plugin only at session start, so the band does not appear in
sessions that were already open — including, usually, the one you are running
in. Tell the user the band shows up in their next session, above the prompt,
after the first response fills in the figures.

## Uninstall

```bash
claude plugin uninstall usage-band@usage-band
```

The mod writes nothing to disk of its own, so there is nothing else to remove.
