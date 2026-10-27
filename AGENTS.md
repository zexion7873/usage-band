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
- **Come back after `/clear`, `/resume` and `/branch`.** No `session.start`
  follows them and `/clear` empties the session's state, so `classic.SessionStart`
  re-reads `$.session.usage()` for those three sources; without it the whole
  band vanishes until the next response. Not `compact`: `usage()` there still
  holds the fill the compaction removed. The clock is not re-armed — only a
  hot reload cancels it.
- **Move `ctx` inside a turn.** `session.measure` fires when a turn ends, not
  per response, so `turn.step` writes each main-thread response's input tokens, and
  `session.compact` writes the result's `tokensAfter` — after a compaction
  `$.session.usage()` still reports the last response's fill. `tokensAfter`
  is the summary alone, so it adds the breakdown's `used` rows other than
  `Messages` (the prompt, tools and memory the next request still carries);
  that breakdown is stale too, its `Messages` row the removed one, so the
  card shows `tokensAfter` in that row's place. Both skip
  subagents; compaction also skips `precompute`.
- **Keep the terminal band to one line.** It is one `Text` with
  `wrap="truncate-end"`; a row of sibling Texts wraps each meter in a column of
  its own once the line outgrows the terminal.
- **Count a window's `+N%` from your last message.** A `prompt.submit` whose
  `origin.kind` is `composer`, `bridge` or `sdk` stores each window's reading
  as its `base`, and each `session.measure` shows the rise over it. Not from the
  last measure: one also fires whenever a window crosses a whole point, and
  readings come whole, so the turn's final step was always 0. Not from
  `turn.start`: a background agent's report starts a main turn of its own (its
  submission's origin is `peer`). The desktop shows the step on the row as well
  as in the card. That row fits one line in a default-width pane only with
  `BAR.width` at 60, half-cell gaps inside each meter, and the cost moved into
  cache's card: the cost grows without bound, so on the row it wraps sooner or
  later. Each block's `minWidth` share (`ROW_SHARE`) is proportional to its
  widest likely content; change what a block can show and its share follows.
  The shares fill the row whole, so a window with none (a gateway's
  `spend_limit`, a kind the band does not know) is drawn after `cache` and
  wraps to a second row; the first stays `ctx`, `5h`, `wk`, `cache`.

Two more have no test yet:

- **Step aside for a survey.** `e.props.hasSurvey` returns `below` untouched.
- **Write the headline before the breakdown.** `session.measure` writes the
  figures from the event first, then fetches the breakdown and writes again, so
  a failed breakdown leaves `ctx`, the windows and the cost current.

## Colours

The desktop bar is an SVG image, so theme keys never reach it — `FILL` and the
tick colours in `plugin/hooks/bar.ts` are literals sampled from the app's own
usage panel. A tick the fill has passed turns white across the fill: that
`#fff` is chosen for contrast, not sampled. The percent text beside it uses the
theme keys `warning` / `error`. The `ctx` hover card's category squares are literals too
(`CONTEXT_SWATCH` in `plugin/hooks/register.tsx`), sampled from the desktop
`/context` panel, which colours categories by rank — the four largest blue,
orange, green, amber, the rest grey — whatever their theme key. The card ranks
by the local estimate, so its colours mark rank, not a category's `/context`
colour. Under a card's title, lines that are always there are plain text and
come first; a line that comes and goes (a window's forecast and step) opens
with the rest-grey square (`CONTEXT_SWATCH_REST`) and sits below them, so a
coloured square in a card always means a rank. A category's
own `color` key draws the terminal's palette instead. The 60% / 85% thresholds in `tone()` are quoted in `README.md`; change
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

A repository ruleset on `main` takes a change only through a pull request whose
`check` job passed, and refuses a direct push, a force-push and deletion. Rename
the job and the ruleset's required check must follow, or every PR blocks.
