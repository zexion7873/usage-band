# usage-band

An always-on band above the Claude Code prompt: context fill and every rate-limit window, with time to reset.

It is a mod (a plugin of function hooks), so it draws in the desktop app's Code tab as well as in the terminal. A `statusLine` command never runs in the desktop Code tab, so status-line usage meters stay invisible there.

## What it shows

| Item | Meaning |
|---|---|
| `ctx` | Context window fill, `tokens/window` beside it. A red tick marks where auto-compact triggers. |
| `5h`, `wk` | Each rate-limit window: percent used and time until it resets. A grey tick marks the share of the window already elapsed, so a fill past the tick is burning faster than an even pace. |
| `spend` | The spend limit, when the account has one. |
| `cache N%` | Cache reads as a share of all input tokens in the last response. |
| `$N.NN` | Session cost. |

Percent turns amber at 60% and red at 85%. On the desktop each meter is a bar whose tooltip lists the detail: the largest context categories, the compact point, the pace. The terminal draws the same figures as one line of text.

Figures come from Claude Code's own session usage, read locally. The mod makes no network requests and no model calls.

## Install

In a terminal session:

```
/plugin install usage-band --marketplace zexion7873/usage-band
```

Answer `y` to add the marketplace, then pick the user scope. The band appears in that session at once. Installed at the user scope, it also loads in sessions the desktop app starts; the desktop Code tab cannot run `/plugin` itself.

## Requirements

A Claude Code build with function-hook plugins (mods). Tests pass on Claude Code 2.1.291.

## Develop

```
claude plugin validate .
claude plugin test .
```

`.claude-plugin/types/` is written by the engine when the mod loads; `tsconfig.json` extends it, so `tsc -p .` type-checks once the mod has loaded once.

## License

MIT
