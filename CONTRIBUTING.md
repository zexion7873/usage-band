# Contributing

**Read [AGENTS.md](AGENTS.md) before you write anything.** It is short on
purpose. The three traps below are the ones that waste an afternoon if you meet
them by surprise; AGENTS.md has the rest.

## Three things that will cost you an afternoon

**The installed copy does not run your checkout.** `usage-band@usage-band` from
the marketplace runs out of `plugins/cache/`, keyed by the `plugin.json`
version. Load the checkout instead — `claude --plugin-dir .` for one session —
and it hot-reloads as you edit. If you have both, you are looking at two bands
and editing one of them.

**`tsc -p .` fails on a fresh clone.** `tsconfig.json` extends
`.claude-plugin/types/`, which the engine writes the first time the mod loads
and git ignores. Load the mod once, then type-check.

**The hero is generated, and CI holds it to the code.** Change `bar()`, a fill
or a tick colour and `docs/band.svg` is stale; CI regenerates it and fails on
any byte of difference. Run `node tools/make-hero.mts` and commit the result.

## Working on it

```bash
claude --plugin-dir .            # a session running this checkout
claude plugin validate .         # manifest + every engine call the module makes
claude plugin test .             # the tests, exactly as CI runs them
node tools/make-hero.mts         # regenerate docs/band.svg
```

"Verified" means: validate passes, the tests pass, the hero matches, and **you
have looked at the band in a real session** — on the desktop Code tab if you
touched the desktop branch, in a terminal if you touched the terminal one. A
green test is one more kind of evidence, not a replacement for looking.

## Pull requests

Do not open a pull request you could not explain line by line if asked. That
rule, and the two beside it, are in the
[Code of Conduct](CODE_OF_CONDUCT.md#send-work-you-understand).

Conventional Commits (`feat:` / `fix:` / `refactor:` / `docs:` / `chore:` /
`test:` / `perf:`), in English, saying WHY rather than WHAT. One logical change
per commit. Do not bump the version in your PR — releases are cut separately.

If your change alters behaviour, interfaces, or project state, the docs it makes
stale are part of the diff: README, AGENTS.md, and `docs/band.svg` if the
drawing moved.
