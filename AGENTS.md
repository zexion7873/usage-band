# Working on usage-band

A Claude Code mod: a plugin of function hooks, one module
(`plugin/hooks/register.tsx`) plus the pure drawing helpers it imports
(`plugin/hooks/bar.ts`). No package manager, no dependencies. `README.md`
covers what it does for a user — this file covers what will waste your time if
you assume it.

What earns a place here: the command, what it covers, and the trap. Rationale
belongs in the code comment or the commit body, not here; this file is loaded
into every session in the repo.

## `plugin/` is what ships, and what gets reviewed

The repo root is the marketplace; `plugin/` is the plugin. The marketplace
lists it with `source: "./plugin"`, so only that tree reaches an install and
only that tree goes through the official marketplace's review. Docs, tools, CI,
and the README images live outside it on purpose.

Keep it that way. The review holds a version when a shipped file names an image
or font (`UNREAD_ASSET_REFERENCED`), and reads a CI command that builds a path
at run time as "sends data off the machine" — paired with the usage token counts
the mod reads, that became a credential hold (`MCP_FORWARDS_CREDENTIAL_ENV`).
Both came from dev files under the old `source: "./"`. A root `CLAUDE.md` inside
the plugin also draws a warning. `plugin/.claude-plugin/icon.png` is the one
image that belongs in the tree, and nothing in the tree names it.

## Changes reach a session by two different paths

- **The checkout** — `claude --plugin-dir plugin` for one session, or the
  `plugin` directory's path in `CLAUDE_CODE_PLUGIN_DIRS` for every session,
  loads it as `usage-band@inline`. A mod loaded this way hot-reloads into the
  running session when a module changes. Fast loop.
- **The installed copy** — `usage-band@usage-band` from the marketplace lives
  under `plugins/cache/`, keyed by the `plugin.json` version. Edits here reach
  it only after a release lands on `main` and the user runs
  `claude plugin marketplace update usage-band` and
  `claude plugin update usage-band@usage-band`.

Symptom of confusing the two: a fix that tests green and is visibly absent from
the band.

## What the band must keep doing

Each of these is pinned by a test in `plugin/tests/band.test.ts`; a change that
reds one is a change in behaviour, not a test to update.

- **Render what is beneath.** `ui.render` for `AbovePrompt` awaits `next(e)`
  first and returns it inside the band. Dropping it erases every other plugin's
  band.
- **Draw nothing before the first measurement.** The atom starts `null`; an
  empty band with `0%` everywhere reads as a broken quota.
- **Keep the clock running.** `session.start` arms `$.clock.every(60_000, …)` to
  invalidate `ui.render`. Without it an idle session freezes every reset
  countdown and pace tick.

Two more have no test yet:

- **Step aside for a survey.** `e.props.hasSurvey` returns `below` untouched.
- **Write the headline before the breakdown.** `session.measure` writes the
  figures from the event first, then fetches the breakdown and writes again, so
  a failed breakdown leaves `ctx`, the windows and the cost current.

## Colours

The desktop bar is an SVG image, so theme keys never reach it — `FILL` and the
tick colours in `plugin/hooks/bar.ts` are literals sampled from the app's own
usage panel. The percent text beside it uses the theme keys `warning` /
`error`. The 60% / 85% thresholds in `tone()` are quoted in `README.md`; change
both.

## `plugin/hooks/bar.ts` stays plain

It must not import `claude-code`. Every generator under `tools/` imports it
under plain node, and that import is what makes the images the mod's own
drawing rather than a copy of it.

## Commands

```bash
claude plugin validate .                 # the marketplace manifest ONLY — it does not descend into plugin/
claude plugin validate --strict plugin   # the plugin + every engine call the module makes; warnings fail
claude plugin test plugin                # plugin/**/*.test.ts in the engine's harness; exits 1 on a failure
(cd plugin && tsc -p .)                  # only after the mod has loaded once — see below
node tools/make-hero.mts                 # README hero; NO ARG OVERWRITES docs/band.svg
node tools/make-social-card.mts | rsvg-convert -o docs/social-card.png       # social preview
node tools/make-icon.mts | rsvg-convert -o plugin/.claude-plugin/icon.png    # marketplace icon
```

Neither local `validate` runs the official marketplace's review checks; the
holds above show up only in the developer portal.

`plugin/.claude-plugin/types/` is written by the engine when the mod loads and
is gitignored; `plugin/tsconfig.json` extends it, so `tsc` has nothing to
extend on a fresh clone. `tools/` sits outside it on purpose — it runs under
node, not the engine.

## The hero

`docs/band.svg` is generated, and byte-reproducible: the generator is string
assembly with no fonts or rasteriser involved. CI regenerates it and `cmp`s the
committed file, so changing `bar()`, `FILL` or a tick colour without rerunning
`node tools/make-hero.mts` reds the build. The README's `width=` must match the
SVG's own `width`; nothing checks that.

## The social card and the icon

`docs/social-card.png` is the repo's social preview, drawn by
`tools/make-social-card.mts` from the same `bar()` plus `plugin.json`'s
description, then rasterised by `rsvg-convert`. Two triggers stale it: the
drawing moving (`bar()`, a fill, a tick colour) and the description changing.
The script throws if the description stops reading `<tagline>: <accent>`.
GitHub takes the social preview only through Settings → General → Social
preview, so a regenerated PNG is not live until someone uploads it there.

`plugin/.claude-plugin/icon.png` is the marketplace listing icon, drawn by
`tools/make-icon.mts` from `bar()` alone. The marketplace takes the icon only
from the first save or submission in the developer portal, so regenerating it
after that changes the file and not the listing.

Neither PNG is checked in CI: both depend on the machine's rasteriser, so they
are not byte-reproducible.

## CI and releases

`.github/workflows/check.yml` installs Claude Code at a PINNED version from npm,
then validates the marketplace and the plugin (strict), tests, and checks the
hero, on every PR and push to `main`. The pin is the version the README's
requirements line names; bump both together.

The version line in `plugin/.claude-plugin/plugin.json` landing on `main` is
the publish. Tags play no part.
