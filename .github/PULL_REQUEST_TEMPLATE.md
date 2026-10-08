## What and why

<!-- What changed, and what it fixes or adds. WHY rather than WHAT — the diff
     already says what. If it fixes an issue, link it. -->

## How you know it works

<!-- Delete the lines that do not apply. -->

- [ ] `claude plugin validate .` and `claude plugin test .` pass.
- [ ] I looked at the band in a real session — desktop Code tab, terminal, or
      both, matching the branch I touched. What I saw:
- [ ] I changed a test, and **showed the old code fails it** — which case, and
      what it printed:
- [ ] `docs/band.svg` regenerated with `node tools/make-hero.mts`, and the
      README's `width=` still matches the SVG's own `width`. (Only when `bar()`,
      a fill or a tick colour moved; CI fails on a stale hero either way.)

> [!IMPORTANT]
> **Do not bump `.claude-plugin/plugin.json`.** That one line *is* the publish —
> this repository is the marketplace people install from — and releases are cut
> separately.

## Docs this makes stale

<!-- Which docs does this change invalidate? "None" is a fine answer — say it
     out loud rather than leaving this blank. CONTRIBUTING.md lists the ones
     that usually go stale. -->
