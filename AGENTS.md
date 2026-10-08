# Working on usage-band

A Claude Code mod: a plugin of function hooks, one module (`hooks/register.tsx`)
plus the pure drawing helpers it imports (`hooks/bar.ts`). No package manager,
no dependencies. `README.md` covers what it does for a user — this file covers
what will waste your time if you assume it.

What earns a place here: the command, what it covers, and the trap. Rationale
belongs in the code comment or the commit body, not here; this file is loaded
into every session in the repo.

## Changes reach a session by two different paths

- **The checkout** — `claude --plugin-dir .` for one session, or a path in
  `CLAUDE_CODE_PLUGIN_DIRS` for every session, loads this directory as
  `usage-band@inline`. A mod loaded this way hot-reloads into the running
  session when a module changes. Fast loop.
- **The installed copy** — `usage-band@usage-band` from the marketplace lives
  under `plugins/cache/`, keyed by the `plugin.json` version. Edits here reach
  it only after a release lands on `main` and the user runs
  `claude plugin marketplace update usage-band` and
  `claude plugin update usage-band@usage-band`.

Symptom of confusing the two: a fix that tests green and is visibly absent from
the band.

## What the band must keep doing

Each of these is pinned by a test in `tests/band.test.ts`; a change that reds
one is a change in behaviour, not a test to update.

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
tick colours in `hooks/bar.ts` are literals sampled from the app's own usage
panel. The percent text beside it uses the theme keys `warning` / `error`. The
60% / 85% thresholds in `tone()` are quoted in `README.md`; change both.

## `hooks/bar.ts` stays plain

It must not import `claude-code`. `tools/make-hero.mts` imports it under plain
node to draw the README hero, and that import is what makes the hero the mod's
own drawing rather than a copy of it.

## Commands

```bash
claude plugin validate .         # manifest + every engine call the module makes
claude plugin test .             # tests/*.test.ts in the engine's harness; exits 1 on a failure
tsc -p .                         # only after the mod has loaded once — see below
node tools/make-hero.mts         # README hero; NO ARG OVERWRITES docs/band.svg
```

`.claude-plugin/types/` is written by the engine when the mod loads and is
gitignored; `tsconfig.json` extends it, so `tsc` has nothing to extend on a
fresh clone. `tools/` sits outside its `include` on purpose — it runs under
node, not the engine.

## The hero

`docs/band.svg` is generated, and byte-reproducible: the generator is string
assembly with no fonts or rasteriser involved. CI regenerates it and `cmp`s the
committed file, so changing `bar()`, `FILL` or a tick colour without rerunning
`node tools/make-hero.mts` reds the build. The README's `width=` must match the
SVG's own `width`; nothing checks that.

## CI and releases

`.github/workflows/check.yml` installs Claude Code at a PINNED version from npm,
then validates, tests, and checks the hero, on every PR and push to `main`.
The pin is the version the README's requirements line names; bump both together.

This repo IS the marketplace: `.claude-plugin/marketplace.json` lists the
plugin with `source: "./"`, so the version line in `.claude-plugin/plugin.json`
landing on `main` is the publish. Tags play no part.
